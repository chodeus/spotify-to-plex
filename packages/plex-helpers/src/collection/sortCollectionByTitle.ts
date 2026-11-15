import { AxiosRequest } from '@spotify-to-plex/http-client/AxiosRequest';
import { getAPIUrl } from '@spotify-to-plex/shared-utils/utils/getAPIUrl';
import { PlexSettings } from '../PlexSettings';
import { handleOneRetryAttempt } from '../retry';
import { validatePlexSettings } from '../utils/validatePlexSettings';

// Plex's collectionSort value for listing by title
const BY_TITLE = '1';

/** Has Plex list a collection's items by title. */
export async function sortCollectionByTitle(settings: PlexSettings, collectionId: string) {
    validatePlexSettings(settings);

    const url = getAPIUrl(settings.uri, `/library/metadata/${collectionId}/prefs`);
    await handleOneRetryAttempt(() => AxiosRequest.put(`${url}?collectionSort=${BY_TITLE}`, settings.token));
}
