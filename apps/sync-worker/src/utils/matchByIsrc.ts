import { getMusicBrainzTrackIdsByIsrc } from "@spotify-to-plex/shared-utils/musicbrainz/getMusicBrainzTrackIdsByIsrc";
import { albumBaseTitle } from "@spotify-to-plex/shared-utils/music/albumBaseTitle";
import { durationsContradict } from "@spotify-to-plex/shared-utils/music/durationSimilarity";
import { findTracksByMusicBrainzIds } from "@spotify-to-plex/plex-music-search/functions/findTracksByMusicBrainzIds";
import { PlexMusicSearchConfig } from "@spotify-to-plex/plex-music-search/types/PlexMusicSearchConfig";
import { PlexTrack } from "@spotify-to-plex/plex-music-search/types/PlexTrack";
import { SearchResponse } from "@spotify-to-plex/plex-music-search/types/SearchResponse";
import { Track as SpotifyTrack } from "@spotify-to-plex/shared-types/spotify/Track";

// A hit song sits on dozens of compilations and each title costs a Plex search per sync
const MAX_OTHER_RELEASES = 10;

// Spotify's album title pins the album, so a "Various Artists" compilation counts too.
// The other releases keep the artist filter: a second copy there would make onlyHit refuse
const ANY_ALBUM_ARTIST = { similarity: 0, contain: false };

// Two different hits mean the id alone cannot choose, and guessing is how wrong matches start
function onlyHit(hits: PlexTrack[]) {
    const unique = hits.filter((hit, index) => hits.findIndex(other => other.id == hit.id) == index);

    return unique.length == 1 ? unique[0] ?? null : null;
}

async function findByIsrc(config: PlexMusicSearchConfig, track: SpotifyTrack, isrc: string) {
    const lookup = await getMusicBrainzTrackIdsByIsrc(isrc, track.duration_ms);
    const [artist] = track.artists;
    if (lookup.status !== 'found' || !artist)
        return null;

    // getCachedPlexTracks would drop a contradicting hit next sync, and the ISRC would add it back
    const fitting = (hits: PlexTrack[]) => hits.filter(hit => !durationsContradict(track.duration_ms, hit.duration_ms));

    // Spotify's own album decides when it holds the recording; other releases are only a fallback.
    // Its base title too: Plex files "Graduation" where Spotify says "Graduation (Deluxe Edition)"
    const spotifyAlbums = [...new Set([track.album, albumBaseTitle(track.album)])].filter(title => title.trim());

    for (const album of spotifyAlbums) {
        const onSpotifyAlbum = fitting(await findTracksByMusicBrainzIds(config, artist, album, lookup.trackIds, ANY_ALBUM_ARTIST));
        if (onSpotifyAlbum.length > 0)
            return onlyHit(onSpotifyAlbum);
    }

    const otherTitles = lookup.releaseTitles
        .filter(title => !spotifyAlbums.includes(title) && title.trim())
        .slice(0, MAX_OTHER_RELEASES);
    const elsewhere: PlexTrack[] = [];

    for (const title of otherTitles)
        elsewhere.push(...await findTracksByMusicBrainzIds(config, artist, title, lookup.trackIds));

    return onlyHit(fitting(elsewhere));
}

/** Gives each unmatched search result a second chance through its track's ISRC. */
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
        } catch (error) {
            // The track stays unmatched, as it was before this step
            console.warn(`ISRC match skipped for "${track.title}": ${error instanceof Error ? error.message : String(error)}`);
        }

        matched.push(searchResult);
    }

    return matched;
}
