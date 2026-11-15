import { AxiosRequest } from '@spotify-to-plex/http-client/AxiosRequest';
import { httpStatusOf } from '@spotify-to-plex/http-client/httpStatusOf';
import { getAPIUrl } from '@spotify-to-plex/shared-utils/utils/getAPIUrl';
import { PlexSettings } from '../PlexSettings';
import { handleOneRetryAttempt } from '../retry';
import { getPlexItemsUri } from '../utils/getPlexItemsUri';
import { validatePlexSettings } from '../utils/validatePlexSettings';

const BATCH_SIZE = 100;

/** Adds library items to a collection, up to BATCH_SIZE keys per request; Plex skips keys it no longer has. */
export async function addItemsToCollection(settings: PlexSettings, collectionId: string, keys: string[]) {
    validatePlexSettings(settings);

    const url = getAPIUrl(settings.uri, `/library/collections/${collectionId}/items`);

    for (let start = 0; start < keys.length; start += BATCH_SIZE) {
        const uri = getPlexItemsUri(settings, keys.slice(start, start + BATCH_SIZE));
        try {
            // Safe to retry: adding an item the collection already holds changes nothing
            await handleOneRetryAttempt(() => AxiosRequest.put(`${url}?uri=${encodeURIComponent(uri)}`, settings.token));
        } catch (error) {
            // Plex answers 400 for a batch holding none of its keys; the caller's re-read names every key not added
            if (httpStatusOf(error) !== 400)
                throw error;
        }
    }
}
