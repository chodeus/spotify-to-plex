import { AxiosRequest } from '@spotify-to-plex/http-client/AxiosRequest';
import { getAPIUrl } from '@spotify-to-plex/shared-utils/utils/getAPIUrl';
import { PlexSettings } from '../PlexSettings';
import { handleOneRetryAttempt } from '../retry';
import { ratingKeyOf } from '../utils/ratingKeyOf';
import { validatePlexSettings } from '../utils/validatePlexSettings';

/** Takes one library item out of a collection. */
export async function removeItemFromCollection(settings: PlexSettings, collectionId: string, key: string) {
    validatePlexSettings(settings);

    const url = getAPIUrl(settings.uri, `/library/collections/${collectionId}/children/${ratingKeyOf(key)}`);
    await handleOneRetryAttempt(() => AxiosRequest.delete(url, settings.token));
}
