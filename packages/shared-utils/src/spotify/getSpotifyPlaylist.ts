import { GetSpotifyPlaylist } from "@spotify-to-plex/shared-types/spotify/GetSpotifyPlaylist";
import { Page, PlaylistedTrack, SpotifyApi, Track } from "@spotify/web-api-ts-sdk";

// ~350ms between pages keeps well under Spotify's ~180 requests/minute
const PAGE_DELAY = 350;

/**
 * The first page of a playlist's tracks from the dedicated endpoint. Returns
 * undefined rather than throwing so a refusal just falls through to whatever
 * the caller was going to do anyway.
 */
async function fetchTracksPage(id: string, accessToken?: string): Promise<Page<PlaylistedTrack<Track>> | null> {
    if (!accessToken)
        return null;

    try {
        const response = await fetch(`https://api.spotify.com/v1/playlists/${id}/tracks?limit=100`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!response.ok) {
            console.error(`❌ Playlist ${id} tracks endpoint refused: ${response.status} ${response.statusText}`);

            return null;
        }

        return await response.json() as Page<PlaylistedTrack<Track>>;
    } catch (_e: unknown) {
        console.error(`❌ Playlist ${id} tracks endpoint unreachable`);

        return null;
    }
}

// One mapping for every page - tracks past the first used to keep "A, B" as one artist
function mapTracks(items: PlaylistedTrack<Track>[]) {
    return items
        .map(item => {
            const track: Track | undefined = (item as any).item ?? (item as any).track;
            if (!track || typeof track !== 'object')
                return null;

            // Local files have no id but do have a spotify:local: uri
            if (!track.id && !track.uri)
                return null;

            const artists = track.artists?.flatMap(artist => artist.name.split(',').map(name => name.trim()));

            return {
                id: track.id || track.uri,
                title: track.name,
                artist: track.artists?.[0]?.name || 'Unknown',
                album: track.album?.name || 'Unknown',
                artists: artists || [],
                album_id: track.album?.id || 'unknown',
                duration_ms: track.duration_ms
            }
        })
        .filter((track) => !!track);
}

export async function getSpotifyPlaylist(api: SpotifyApi, id: string, simplified: boolean) {


    try {
        const tokenInfo = await api.getAccessToken();
        const result = await api.playlists.getPlaylist(id)
        const playlist: GetSpotifyPlaylist = {
            type: "spotify-playlist",
            id: result.id,
            title: result.name,
            owner: result.owner?.display_name || 'Unknown',
            image: result.images?.[0]?.url || '',
            tracks: []
        }

        // Spotify Web API change (rolled out late 2024): user-authenticated
        // /playlists/{id} responses now return the tracks page under `items`
        // instead of `tracks`, and each entry exposes the track object as
        // `item` instead of `track`. Read both shapes so the function keeps
        // working for any account or region still on the legacy response.
        // Pick whichever field actually holds a page of tracks: `??` alone would
        // take an `items` field that is present but not a tracks page, and skip
        // a perfectly good legacy `tracks` alongside it.
        let tracksPage: Page<PlaylistedTrack<Track>> | null | undefined = [(result as any).items, (result as any).tracks]
            .find((page) => Array.isArray(page?.items)) as Page<PlaylistedTrack<Track>> | undefined;

        // A playlist the connected user follows but does not own can come back
        // with no tracks page at all. Ask the dedicated endpoint before giving
        // up on the API and handing the playlist to the scraper
        if (!tracksPage?.items)
            tracksPage = await fetchTracksPage(id, tokenInfo?.access_token);

        if (!tracksPage?.items) {
            console.error(`❌ Playlist ${id} response missing tracks page. Most likely fetched with client_credentials — Spotify no longer returns playlist tracks to that auth mode. A user access token is required.`);

            return null;
        }

        playlist.tracks = mapTracks(tracksPage.items);
        if (simplified)
            return playlist;

        let nextUrl: string | null = tracksPage.next
        while (nextUrl) {

            const response = await fetch(nextUrl, {
                headers: {
                    'Authorization': `Bearer ${tokenInfo?.access_token}`
                }
            });

            // A partial read would sync as a shrunken playlist. Fail the API path
            // instead, so the caller falls back to the scraper, which pages itself
            if (!response.ok)
                throw new Error(`Page fetch failed: ${response.status} ${response.statusText}`);

            const loadMore = await response.json() as Page<PlaylistedTrack<Track>>;
            if (!Array.isArray(loadMore.items))
                throw new Error(`Page fetch returned no items`);

            playlist.tracks = playlist.tracks.concat(mapTracks(loadMore.items));
            nextUrl = loadMore.next

            if (nextUrl)
                await new Promise(resolve => { setTimeout(resolve, PAGE_DELAY) });
        }

        return playlist;

    } catch (e) {
        console.error("❌ Error in getSpotifyPlaylist:", e);

        return null;
    }
}
