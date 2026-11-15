import { AxiosRequest } from '@spotify-to-plex/http-client/AxiosRequest';
import { getAPIUrl } from '@spotify-to-plex/shared-utils/utils/getAPIUrl';
import { PlexSettings } from '../PlexSettings';
import { handleOneRetryAttempt } from '../retry';
import { validatePlexSettings } from '../utils/validatePlexSettings';

type CollectionChildrenResponse = {
    MediaContainer?: {
        Metadata?: { key: string }[];
    };
};

/** The keys of the items a collection holds. */
export async function getCollectionItemKeys(settings: PlexSettings, collectionId: string) {
    validatePlexSettings(settings);

    const url = getAPIUrl(settings.uri, `/library/collections/${collectionId}/children`);
    const response = await handleOneRetryAttempt(() => AxiosRequest.get<CollectionChildrenResponse>(url, settings.token));
    const container = response.data?.MediaContainer;
    if (!container)
        throw new Error(`Plex did not answer with the items of collection ${collectionId}`);

    return (container.Metadata ?? []).map(item => item.key);
}
