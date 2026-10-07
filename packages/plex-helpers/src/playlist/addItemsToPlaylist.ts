import { AxiosRequest } from '@spotify-to-plex/http-client/AxiosRequest';
import { httpStatusOf } from '@spotify-to-plex/http-client/httpStatusOf';
import { PlexSettings } from '../PlexSettings';
import { PlaylistItem } from '../PlaylistItem';
import { RetryConfig } from '../RetryConfig';
import { handleOneRetryAttempt } from '../retry';
import { validatePlexSettings } from '../utils/validatePlexSettings';
import { getPlexUri } from '../utils/getPlexUri';
import { getAPIUrl } from '@spotify-to-plex/shared-utils/utils/getAPIUrl';

/** Adds items to a Plex playlist and returns the keys Plex refused. Throws once Plex stops answering. */
export async function addItemsToPlaylist(settings: PlexSettings, playlistId: string, items: PlaylistItem[], config: RetryConfig = {}) {
    validatePlexSettings(settings);

    const url = getAPIUrl(settings.uri, `/playlists/${playlistId}/items`);
    const refused: string[] = [];

    for (const item of items) {
        if (!item?.key)
            continue;

        const uri = getPlexUri(settings, item.key, item.source);

        try {
            await handleOneRetryAttempt(() => AxiosRequest.put(`${url}?uri=${encodeURIComponent(uri)}`, settings.token), config);
        } catch (error) {
            // No answer means Plex is gone, and every remaining item would wait out its own retry
            if (!httpStatusOf(error))
                throw error;

            refused.push(item.key);
        }
    }

    return refused;
}
