import { AxiosRequest } from '@spotify-to-plex/http-client/AxiosRequest';
import { getAPIUrl } from '@spotify-to-plex/shared-utils/utils/getAPIUrl';
import { PlexSettings } from '../PlexSettings';
import { handleOneRetryAttempt } from '../retry';
import { validatePlexSettings } from '../utils/validatePlexSettings';

type SectionCollectionsResponse = {
    MediaContainer?: {
        Metadata?: { ratingKey: string, title: string }[];
    };
};

/** The collections in a library section. */
export async function getSectionCollections(settings: PlexSettings, sectionId: number) {
    validatePlexSettings(settings);

    const url = getAPIUrl(settings.uri, `/library/sections/${sectionId}/collections`);
    const response = await handleOneRetryAttempt(() => AxiosRequest.get<SectionCollectionsResponse>(url, settings.token));
    const container = response.data?.MediaContainer;
    if (!container)
        throw new Error(`Plex did not answer with the collections of library ${sectionId}`);

    return container.Metadata ?? [];
}
