import { MusicBrainzLookup } from '@spotify-to-plex/shared-types/musicbrainz/MusicBrainzLookup';
import { getMusicBrainzCache, type MusicBrainzAlbumCache } from '../cache/getMusicBrainzCache';
import { musicBrainzGet } from './utils/musicBrainzGet';
import { isTransientError } from './utils/isTransientError';
import { getMusicBrainzIdsByTextSearch } from './getMusicBrainzIdsByTextSearch';

/**
 * Response from MusicBrainz URL API
 */
type MusicBrainzUrlResponse = {
    id: string;
    resource: string;
    relations: {
        type: string;
        'type-id': string;
        direction: string;
        'target-type': string;
        release?: {
            id: string;
            title: string;
            disambiguation: string;
            status: string | null;
            'status-id': string | null;
            date: string;
            country: string;
            barcode: string | null;
            packaging: string | null;
            'packaging-id': string | null;
        };
    }[];
};

/**
 * Response from MusicBrainz Release API
 */
type MusicBrainzReleaseResponse = {
    id: string;
    title: string;
    'release-group': {
        id: string;
        title: string;
        'primary-type': string;
        'primary-type-id': string;
        'secondary-types': string[];
        'secondary-type-ids': string[];
        disambiguation: string;
        'first-release-date': string;
    };
    'artist-credit': {
        artist: {
            id: string;
            name: string;
            'sort-name': string;
        };
    }[];
};

/**
 * Resolve the album through the Spotify URL MusicBrainz holds for it, when it
 * holds one. Most albums have no such relation, which is not a verdict on
 * whether MusicBrainz has the release group under its name.
 */
async function lookupBySpotifyUrl(spotifyAlbumId: string): Promise<MusicBrainzLookup> {
    try {
        const urlApiUrl = `https://musicbrainz.org/ws/2/url?resource=https://open.spotify.com/album/${spotifyAlbumId}&fmt=json&inc=release-rels`;
        const urlResponse = await musicBrainzGet<MusicBrainzUrlResponse>(urlApiUrl);

        const releaseRelation = urlResponse.data.relations?.find(
            rel => rel.direction === 'backward' && rel['target-type'] === 'release' && rel.release
        );

        if (!releaseRelation?.release)
            return { status: 'not-found' };

        const releaseId = releaseRelation.release.id;

        const releaseApiUrl = `https://musicbrainz.org/ws/2/release/${releaseId}?inc=release-groups+artist-credits&fmt=json`;
        const releaseResponse = await musicBrainzGet<MusicBrainzReleaseResponse>(releaseApiUrl);

        const releaseGroupId = releaseResponse.data['release-group']?.id;
        const artistId = releaseResponse.data['artist-credit']?.[0]?.artist?.id;
        if (!releaseGroupId || !artistId)
            return { status: 'not-found' };

        return { status: 'found', releaseGroupId, artistId, releaseId };

    } catch (error: unknown) {
        if (isTransientError(error))
            return { status: 'unavailable' };

        // A 404 is the ordinary case here: no Spotify URL is on file
        return { status: 'not-found' };
    }
}

/**
 * Get MusicBrainz release group and artist IDs from Spotify album ID
 * Uses caching to minimize API calls
 * Falls back to text search when the album carries no Spotify URL relation
 */
export async function getMusicBrainzIds(spotifyAlbumId: string, artistName?: string, albumName?: string): Promise<MusicBrainzLookup> {
    const cache = getMusicBrainzCache();

    const cached = cache.get(spotifyAlbumId);
    if (cached)
        return cached.musicbrainz_release_id === undefined ? fillReleaseId(cache, cached) : fromCache(cached);

    if (cache.hasRecentMiss(spotifyAlbumId))
        return { status: 'not-found' };

    const direct = await lookupBySpotifyUrl(spotifyAlbumId);
    if (direct.status === 'found') {
        cache.add(cacheEntry(spotifyAlbumId, direct));

        return direct;
    }

    if (direct.status === 'unavailable')
        return direct;

    // The URL lookup returning nothing is the norm, not the answer - only the
    // name search can say the release group is genuinely absent
    if (!artistName || !albumName)
        return { status: 'not-found' };

    const found = await getMusicBrainzIdsByTextSearch(artistName, albumName);
    if (found.status === 'found') {
        cache.add(cacheEntry(spotifyAlbumId, found));
    } else if (found.status === 'not-found') {
        cache.addMiss(spotifyAlbumId);
    }

    return found;
}

type Found = Extract<MusicBrainzLookup, { status: 'found' }>;

function fromCache(cached: MusicBrainzAlbumCache): Found {
    return {
        status: 'found',
        releaseGroupId: cached.musicbrainz_release_group_id,
        artistId: cached.musicbrainz_artist_id,
        releaseId: cached.musicbrainz_release_id ?? undefined
    };
}

function cacheEntry(spotifyAlbumId: string, found: Found) {
    return {
        spotify_album_id: spotifyAlbumId,
        musicbrainz_release_group_id: found.releaseGroupId,
        musicbrainz_artist_id: found.artistId,
        musicbrainz_release_id: found.releaseId ?? null
    };
}

/** An entry cached before releases were kept: one URL lookup fills its release in, and keeps its mapping when no URL is on file. */
async function fillReleaseId(cache: ReturnType<typeof getMusicBrainzCache>, cached: MusicBrainzAlbumCache): Promise<MusicBrainzLookup> {
    const direct = await lookupBySpotifyUrl(cached.spotify_album_id);
    // Left unfilled, so the next run asks again
    if (direct.status === 'unavailable')
        return fromCache(cached);

    const found = direct.status === 'found' ? direct : fromCache(cached);
    cache.add(cacheEntry(cached.spotify_album_id, found));

    return found;
}
