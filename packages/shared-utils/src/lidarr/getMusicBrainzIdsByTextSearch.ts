import axios from 'axios';
import { MusicBrainzTextSearchResponse } from '@spotify-to-plex/shared-types/musicbrainz/MusicBrainzTextSearchResponse';
import { MusicBrainzLookup } from '@spotify-to-plex/shared-types/musicbrainz/MusicBrainzLookup';
import { rateLimitDelay } from './utils/rateLimitDelay';
import { withRetry } from './utils/withRetry';
import { validateMusicBrainzMatch } from './validateMusicBrainzMatch';

// Enough candidates to get past a stronger-scoring wrong answer. The right
// release group is regularly not the top hit: searching "Billy Idol New Wave
// Hits Of The 80s" ranks the self-titled "Billy Idol" first
const SEARCH_LIMIT = 10;

// Lucene syntax characters, which would otherwise change what the query means
function escapeLucene(value: string) {
    return value.replace(/[!"#$%&'()*+:;<=>?@[\\\]^{|}~-]/g, String.raw`\$&`);
}

/**
 * Get MusicBrainz IDs using text search (fallback method)
 * Uses artist and album names to search MusicBrainz
 */
export async function getMusicBrainzIdsByTextSearch(artistName: string, albumName: string): Promise<MusicBrainzLookup> {
    // Fielded first so the words have to land in the right fields; the loose
    // query is only a second chance for names the fields spell differently
    const queries = [
        `artist:"${escapeLucene(artistName)}" AND releasegroup:"${escapeLucene(albumName)}"`,
        `${artistName} ${albumName}`
    ];

    for (const query of queries) {
        await rateLimitDelay();

        let searchResponse;
        try {
            const searchUrl = `https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(query)}&fmt=json&limit=${SEARCH_LIMIT}`;
            searchResponse = await withRetry(() => axios.get<MusicBrainzTextSearchResponse>(searchUrl));
        } catch (_e: unknown) {
            // A MusicBrainz that errored told us nothing - saying "not found"
            // here would cache an outage as a permanent miss
            return { status: 'unavailable' };
        }

        for (const candidate of searchResponse.data['release-groups'] ?? []) {
            const releaseGroupId = candidate.id;
            const artistId = candidate['artist-credit']?.[0]?.artist?.id;
            if (!releaseGroupId || !artistId)
                continue;

            const mbArtistName = candidate['artist-credit']?.[0]?.artist?.name || '';
            if (validateMusicBrainzMatch(artistName, albumName, mbArtistName, candidate.title || ''))
                return { status: 'found', releaseGroupId, artistId };
        }
    }

    return { status: 'not-found' };
}
