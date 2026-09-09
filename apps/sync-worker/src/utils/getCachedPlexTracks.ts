import { getCachedTrackLinks } from "@spotify-to-plex/shared-utils/cache/getCachedTrackLink";
import { durationSimilarity } from "@spotify-to-plex/shared-utils/music/durationSimilarity";
import { versionsMatch } from "@spotify-to-plex/music-search/utils/compareVersions";
import { Track as SpotifyTrack } from "@spotify-to-plex/shared-types/spotify/Track";
import { GetSpotifyAlbum } from "@spotify-to-plex/shared-types/spotify/GetSpotifyAlbum";
import { GetSpotifyPlaylist } from "@spotify-to-plex/shared-types/spotify/GetSpotifyPlaylist";
import { TrackLink } from "@spotify-to-plex/shared-types/common/track";
import { PlexTrack } from "@spotify-to-plex/plex-music-search/types/PlexTrack";
import { SearchResponse } from "@spotify-to-plex/plex-music-search/types/SearchResponse";
import { getById } from "@spotify-to-plex/plex-music-search/functions/getById";
import { PlexMusicSearchConfig } from "@spotify-to-plex/plex-music-search/types/PlexMusicSearchConfig";

// Below this the cached track is a different version, not a different encode
const DURATION_THRESHOLD = 0.65;

// Loads the cached plex tracks for one link, dropping any whose duration
// contradicts the spotify track. Returns the ids worth keeping in the cache:
// a rejected id is dropped, but an id we simply failed to load is kept -
// plex being briefly unreachable is no reason to delete a good link.
async function loadLinkedTracks(config: PlexMusicSearchConfig, trackLink: TrackLink, searchItem: SpotifyTrack, filterOutWords: string[]) {
    const tracks: PlexTrack[] = [];
    const keptIds: string[] = [];
    let failed = false;
    const { title, duration_ms: durationMs, artists = [] } = searchItem;

    for (const plexId of trackLink.plex_id ?? []) {
        try {
            const metaData = await getById(config, plexId);
            const similarity = durationSimilarity(durationMs, metaData.duration_ms);

            if (!trackLink.manual && similarity && similarity < DURATION_THRESHOLD) {
                console.log(`Dropping cached link for "${title}": duration mismatch (${Math.round(similarity * 100)}%)`);
                continue;
            }

            // Two recordings of the same length clear the duration check, so the
            // titles have to be asked too - "REACT" cached against
            // "REACT - Culture Shock Remix". The search applies this to new
            // matches; without it here a link made before it never re-evaluates
            if (!trackLink.manual && !versionsMatch(metaData.title, title, filterOutWords, artists).match) {
                console.log(`Dropping cached link for "${title}": version mismatch ("${metaData.title}")`);
                continue;
            }

            keptIds.push(plexId);
            tracks.push(metaData);
        } catch (_e) {
            keptIds.push(plexId);
            failed = true;
        }
    }

    return { tracks, keptIds, failed };
}

export async function getCachedPlexTracks(plexSearchConfig: PlexMusicSearchConfig, data: GetSpotifyPlaylist | GetSpotifyAlbum) {
    const { add, save, found: cachedTrackLinks } = getCachedTrackLinks(data.tracks, 'plex');
    const result: SearchResponse[] = [];
    let pruned = false;
    // Read from the config rather than music-search state: the search that sets
    // that state runs after this, so on the first playlist it is still empty
    const filterOutWords = plexSearchConfig.musicSearchConfig?.textProcessing?.filterOutWords ?? [];

    for (let i = 0; i < data.tracks.length; i++) {
        const searchItem = data.tracks[i];
        if (!searchItem?.id)
            continue;

        // Process if no cached link has been found
        const trackLink = cachedTrackLinks.find(item => item.spotify_id == searchItem.id);
        if (!trackLink?.plex_id || trackLink.plex_id?.length == 0)
            continue;

        const { tracks, keptIds, failed } = await loadLinkedTracks(plexSearchConfig, trackLink, searchItem, filterOutWords)

        // Flushed by the save() below - add() is not guaranteed to run this sync
        if (keptIds.length !== trackLink.plex_id.length) {
            trackLink.plex_id = keptIds;
            pruned = true;
        }

        // A manual pick whose lookups all failed is not evidence of a bad link.
        // Keep it out of the automatic re-search so a plex hiccup cannot replace it
        if (tracks.length == 0 && !(trackLink.manual && failed))
            continue;

        // Add the result
        result.push({
            id: searchItem.id,
            title: searchItem.title,
            artist: searchItem.artists?.[0] || 'Unknown',
            album: searchItem.album || "",
            result: tracks
        });
    }

    // The prune must reach disk even when nothing else triggered a re-search
    if (pruned)
        save();

    return { add, result };
}
