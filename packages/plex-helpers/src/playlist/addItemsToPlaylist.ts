import { AxiosRequest } from '@spotify-to-plex/http-client/AxiosRequest';
import { httpStatusOf } from '@spotify-to-plex/http-client/httpStatusOf';
import { isRetryable } from '@spotify-to-plex/http-client/isRetryable';
import { PlexSettings } from '../PlexSettings';
import { PlaylistItem } from '../PlaylistItem';
import { RetryConfig } from '../RetryConfig';
import { handleOneRetryAttempt } from '../retry';
import { validatePlexSettings } from '../utils/validatePlexSettings';
import { getPlexUri } from '../utils/getPlexUri';
import { getAPIUrl } from '@spotify-to-plex/shared-utils/utils/getAPIUrl';

/** Adds items to a Plex playlist and returns the keys Plex refused. Throws on a failure that is not about the item. */
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
            // Only a 4xx about this item is a refusal. No answer, a 5xx, a rate limit or a rejected
            // token would fail every remaining item the same way, each after its own retry
            const status = httpStatusOf(error);
            if (isRetryable(error) || status === 401 || status === 403)
                throw error;

            refused.push(item.key);
        }
    }

    return refused;
}
