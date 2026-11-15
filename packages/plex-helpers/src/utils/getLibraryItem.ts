import { AxiosRequest } from '@spotify-to-plex/http-client/AxiosRequest';
import { httpStatusOf } from '@spotify-to-plex/http-client/httpStatusOf';
import { getAPIUrl } from '@spotify-to-plex/shared-utils/utils/getAPIUrl';
import { PlexSettings } from '../PlexSettings';
import { handleOneRetryAttempt } from '../retry';
import { validatePlexSettings } from './validatePlexSettings';

type LibraryItemResponse = {
    MediaContainer?: {
        Metadata?: { ratingKey: string, key: string, type: string, title: string, librarySectionID?: number }[];
    };
};

/** The library item at a key such as /library/metadata/123, or undefined when Plex no longer has it. */
export async function getLibraryItem(settings: PlexSettings, key: string) {
    validatePlexSettings(settings);

    const url = getAPIUrl(settings.uri, key);
    try {
        const response = await handleOneRetryAttempt(() => AxiosRequest.get<LibraryItemResponse>(url, settings.token));
        const container = response.data?.MediaContainer;
        if (!container)
            throw new Error(`Plex did not answer with the item at ${key}`);

        return container.Metadata?.[0];
    } catch (error) {
        if (httpStatusOf(error) === 404)
            return;

        throw error;
    }
}
