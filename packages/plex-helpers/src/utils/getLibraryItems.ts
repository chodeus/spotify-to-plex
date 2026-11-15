import { AxiosRequest } from '@spotify-to-plex/http-client/AxiosRequest';
import { httpStatusOf } from '@spotify-to-plex/http-client/httpStatusOf';
import { getAPIUrl } from '@spotify-to-plex/shared-utils/utils/getAPIUrl';
import { PlexSettings } from '../PlexSettings';
import { handleOneRetryAttempt } from '../retry';
import { KEYS_PER_REQUEST } from './keysPerRequest';
import { ratingKeyOf } from './ratingKeyOf';
import { validatePlexSettings } from './validatePlexSettings';

export type LibraryItem = { ratingKey: string, key: string, type: string, title: string, librarySectionID?: number };

type LibraryItemsResponse = {
    MediaContainer?: { Metadata?: LibraryItem[] };
};

/** The items Plex still has among keys such as /library/metadata/123 or bare ratingKeys. */
export async function getLibraryItems(settings: PlexSettings, keys: string[]) {
    validatePlexSettings(settings);

    const ratingKeys = keys.map(ratingKeyOf);
    const items: LibraryItem[] = [];

    for (let start = 0; start < ratingKeys.length; start += KEYS_PER_REQUEST) {
        const url = getAPIUrl(settings.uri, `/library/metadata/${ratingKeys.slice(start, start + KEYS_PER_REQUEST).join(',')}`);
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
