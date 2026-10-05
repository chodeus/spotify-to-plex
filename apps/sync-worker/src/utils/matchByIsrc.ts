import { getMusicBrainzTrackIdsByIsrc } from "@spotify-to-plex/shared-utils/musicbrainz/getMusicBrainzTrackIdsByIsrc";
import { findTracksByMusicBrainzIds } from "@spotify-to-plex/plex-music-search/functions/findTracksByMusicBrainzIds";
import { PlexMusicSearchConfig } from "@spotify-to-plex/plex-music-search/types/PlexMusicSearchConfig";
import { PlexTrack } from "@spotify-to-plex/plex-music-search/types/PlexTrack";
import { SearchResponse } from "@spotify-to-plex/plex-music-search/types/SearchResponse";
import { Track as SpotifyTrack } from "@spotify-to-plex/shared-types/spotify/Track";

// A hit song sits on dozens of compilations and each title costs a Plex search per sync
const MAX_OTHER_RELEASES = 10;

// Two different hits mean the id alone cannot choose, and guessing is how wrong matches start
function onlyHit(hits: PlexTrack[]) {
    const unique = hits.filter((hit, index) => hits.findIndex(other => other.id == hit.id) == index);

    return unique.length == 1 ? unique[0] ?? null : null;
}

async function findByIsrc(config: PlexMusicSearchConfig, track: SpotifyTrack, isrc: string) {
    const lookup = await getMusicBrainzTrackIdsByIsrc(isrc);
    const [artist] = track.artists;
    if (lookup.status !== 'found' || !artist)
        return null;

    // Spotify's own album decides when it holds the recording; other releases are only a fallback
    if (track.album.trim()) {
        const onSpotifyAlbum = await findTracksByMusicBrainzIds(config, artist, track.album, lookup.trackIds);
        if (onSpotifyAlbum.length > 0)
            return onlyHit(onSpotifyAlbum);
    }

    const otherTitles = lookup.releaseTitles
        .filter(title => title != track.album && title.trim())
        .slice(0, MAX_OTHER_RELEASES);
    const elsewhere: PlexTrack[] = [];

    for (const title of otherTitles)
        elsewhere.push(...await findTracksByMusicBrainzIds(config, artist, title, lookup.trackIds));

    return onlyHit(elsewhere);
}

/**
 * Gives a search result with no match a second chance through the track's ISRC,
 * which pins the exact recording where the titles disagree.
 */
export async function matchByIsrc(config: PlexMusicSearchConfig, searchResults: SearchResponse[], tracks: SpotifyTrack[]) {
    const matched: SearchResponse[] = [];

    for (const searchResult of searchResults) {
        const track = tracks.find(item => item.id == searchResult.id);
        if (searchResult.result.length > 0 || !track?.isrc) {
            matched.push(searchResult);
            continue;
        }

        try {
            const plexTrack = await findByIsrc(config, track, track.isrc);
            if (plexTrack) {
                console.log(`Matched "${track.title}" by ISRC: "${plexTrack.title}"`);
                matched.push({ ...searchResult, result: [plexTrack], matched_by: 'isrc' });
                continue;
            }
        } catch (_e) {
            // Plex unreachable: the track stays unmatched, as it was before this step
        }

        matched.push(searchResult);
    }

    return matched;
}
