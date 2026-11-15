import { AxiosRequest } from '@spotify-to-plex/http-client/AxiosRequest';
import { httpStatusOf } from '@spotify-to-plex/http-client/httpStatusOf';
import { getAPIUrl } from '@spotify-to-plex/shared-utils/utils/getAPIUrl';
import { PlexSettings } from '../PlexSettings';
import { handleOneRetryAttempt } from '../retry';
import { validatePlexSettings } from './validatePlexSettings';

export type LibraryItem = { ratingKey: string, key: string, type: string, title: string, librarySectionID?: number };

type LibraryItemsResponse = {
    MediaContainer?: { Metadata?: LibraryItem[] };
};

// Keeps the URL within the length Plex accepts
const BATCH_SIZE = 100;

/** The ratingKey in a key such as /library/metadata/123; a bare ratingKey stays as it is. */
export const ratingKeyOf = (key: string) => key.slice(key.lastIndexOf('/') + 1);

/** The items Plex still has among keys such as /library/metadata/123 or bare ratingKeys. */
export async function getLibraryItems(settings: PlexSettings, keys: string[]) {
    validatePlexSettings(settings);

    const ratingKeys = keys.map(ratingKeyOf);
    const items: LibraryItem[] = [];

    for (let start = 0; start < ratingKeys.length; start += BATCH_SIZE) {
        const url = getAPIUrl(settings.uri, `/library/metadata/${ratingKeys.slice(start, start + BATCH_SIZE).join(',')}`);
        try {
            const response = await handleOneRetryAttempt(() => AxiosRequest.get<LibraryItemsResponse>(url, settings.token));
            const container = response.data?.MediaContainer;
            if (!container)
                throw new Error(`Plex did not answer with the library items`);

            items.push(...container.Metadata ?? []);
        } catch (error) {
            // Plex answers 404 when it has none of the batch
            if (httpStatusOf(error) !== 404)
                throw error;
        }
    }

    return items;
}
