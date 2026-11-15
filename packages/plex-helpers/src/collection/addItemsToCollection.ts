import { AxiosRequest } from '@spotify-to-plex/http-client/AxiosRequest';
import { getAPIUrl } from '@spotify-to-plex/shared-utils/utils/getAPIUrl';
import { PlexSettings } from '../PlexSettings';
import { handleOneRetryAttempt } from '../retry';
import { getPlexItemsUri } from '../utils/getPlexItemsUri';
import { KEYS_PER_REQUEST } from '../utils/keysPerRequest';
import { validatePlexSettings } from '../utils/validatePlexSettings';

/** Adds library items to a collection, up to KEYS_PER_REQUEST keys per request; Plex skips keys it no longer has, and refuses a batch of only those. */
export async function addItemsToCollection(settings: PlexSettings, collectionId: string, keys: string[]) {
    validatePlexSettings(settings);

    const url = getAPIUrl(settings.uri, `/library/collections/${collectionId}/items`);

    for (let start = 0; start < keys.length; start += KEYS_PER_REQUEST) {
        const uri = getPlexItemsUri(settings, keys.slice(start, start + KEYS_PER_REQUEST));
        // Safe to retry: adding an item the collection already holds changes nothing
        await handleOneRetryAttempt(() => AxiosRequest.put(`${url}?uri=${encodeURIComponent(uri)}`, settings.token));
    }
}
