import { AxiosRequest } from '@spotify-to-plex/http-client/AxiosRequest';
import { getAPIUrl } from '@spotify-to-plex/shared-utils/utils/getAPIUrl';
import { PlexSettings } from '../PlexSettings';
import { validatePlexSettings } from '../utils/validatePlexSettings';

type PlaylistItemsResponse = {
    MediaContainer?: {
        Metadata?: { key?: string }[];
    };
};

/** The keys of a playlist's items, in playlist order. */
export async function getPlaylistItemKeys(settings: PlexSettings, playlistId: string) {
    validatePlexSettings(settings);

    const url = getAPIUrl(settings.uri, `/playlists/${playlistId}/items`);
    const response = await AxiosRequest.get<PlaylistItemsResponse>(url, settings.token);

    return (response.data.MediaContainer?.Metadata ?? []).map(item => item.key ?? '');
}
