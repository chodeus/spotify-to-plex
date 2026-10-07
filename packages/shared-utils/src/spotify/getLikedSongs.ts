import { GetSpotifyPlaylist } from "@spotify-to-plex/shared-types/spotify/GetSpotifyPlaylist";
import { SpotifyApi } from "@spotify/web-api-ts-sdk";
import { mapSpotifyTracks } from "./mapSpotifyTracks";


export async function getLikedSongs(api: SpotifyApi, userId: string, userName: string, simplified: boolean) {


    try {
        const result = await api.currentUser.tracks.savedTracks(50, 0)
        const playlist: GetSpotifyPlaylist = {
            type: "spotify-playlist",
            id: `liked-${userId}`,
            title: "Liked Songs",
            owner: userName,
            image: '',
            tracks: []
        }
        const validTracks = mapSpotifyTracks(result.items);

        playlist.tracks = playlist.tracks.concat(validTracks);
        if (simplified)
            return playlist;

        let offset = 50;
        let hasMoreResults = result.offset + result.limit < result.total;

        if (result.next) {
            while (hasMoreResults) {
                const loadMore = await api.currentUser.tracks.savedTracks(50, offset)
                const validLoadMoreTracks = mapSpotifyTracks(loadMore.items);

                playlist.tracks = playlist.tracks.concat(validLoadMoreTracks);

                hasMoreResults = loadMore.offset + loadMore.limit < loadMore.total;
                offset = loadMore.offset + loadMore.limit;

                // Add throttling between pagination requests (~171 req/min)
                if (hasMoreResults)
                    await new Promise(resolve => { setTimeout(resolve, 350) });
            }
        }

        return playlist;

    } catch (_e) {
        return null;
    }
}
