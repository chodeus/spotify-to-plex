import { getCachedTrackLinks } from "@spotify-to-plex/shared-utils/cache/getCachedTrackLink";
import { GetSpotifyAlbum } from "@spotify-to-plex/shared-types/spotify/GetSpotifyAlbum";
import { GetSpotifyPlaylist } from "@spotify-to-plex/shared-types/spotify/GetSpotifyPlaylist";
import { PlexTrack } from "@spotify-to-plex/plex-music-search/types/PlexTrack";
import { SearchResponse } from "@spotify-to-plex/plex-music-search/types/SearchResponse";
import { getById } from "@spotify-to-plex/plex-music-search/functions/getById";
import { PlexMusicSearchConfig } from "@spotify-to-plex/plex-music-search/types/PlexMusicSearchConfig";

const DURATION_LINK_THRESHOLD = 0.65;

export async function getCachedPlexTracks(plexSearchConfig: PlexMusicSearchConfig, data: GetSpotifyPlaylist | GetSpotifyAlbum) {
    const { add, found: cachedTrackLinks } = getCachedTrackLinks(data.tracks, 'plex');
    const result: SearchResponse[] = [];

    for (let i = 0; i < data.tracks.length; i++) {
        const searchItem = data.tracks[i];
        if (!searchItem?.id)
            continue;

        // Process if no cached link has been found
        const trackLink = cachedTrackLinks.find(item => item.spotify_id == searchItem.id);
        if (!trackLink?.plex_id || trackLink.plex_id?.length == 0)
            continue;

        // Load the plex tracks data
        const foundTracks: PlexTrack[] = [];

        for (let j = 0; j < trackLink.plex_id.length; j++) {
            const plexId = trackLink.plex_id[j];
            if (!plexId)
                continue;

            try {
                const metaData = await getById(plexSearchConfig, plexId);

                if (!metaData)
                    continue;

                // Drop links whose duration is far off the Spotify track — a wrong-version
                // match cached before the right album existed (mirrors search()'s formula).
                // Manual picks are exempt: someone chose that version on purpose.
                if (!trackLink.manual && searchItem.duration_ms && metaData.duration_ms) {
                    const similarity = 1 - Math.abs(searchItem.duration_ms - metaData.duration_ms) / Math.max(searchItem.duration_ms, metaData.duration_ms);

                    if (similarity < DURATION_LINK_THRESHOLD) {
                        console.log(`Dropping cached link for "${searchItem.title}": duration mismatch (${Math.round(similarity * 100)}%)`);
                        continue;
                    }
                }

                foundTracks.push(metaData);
            } catch (_e) {
            }
        }

        // Try searching again if no tracks are found
        if (foundTracks.length == 0)
            continue;

        // Add the result
        result.push({
            id: searchItem.id,
            title: searchItem.title,
            artist: searchItem.artists?.[0] || 'Unknown',
            album: searchItem.album || "",
            result: foundTracks
        });
    }

    return { add, result };
}
