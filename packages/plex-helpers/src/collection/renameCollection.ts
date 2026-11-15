import { AxiosRequest } from '@spotify-to-plex/http-client/AxiosRequest';
import { getAPIUrl } from '@spotify-to-plex/shared-utils/utils/getAPIUrl';
import { PlexSettings } from '../PlexSettings';
import { handleOneRetryAttempt } from '../retry';
import { validatePlexSettings } from '../utils/validatePlexSettings';

/** Renames a collection; its items' collection tag follows the new title. */
export async function renameCollection(settings: PlexSettings, sectionId: number, collectionId: string, title: string) {
    validatePlexSettings(settings);

    const url = getAPIUrl(settings.uri, `/library/sections/${sectionId}/all`);
    // type 18 = collection; locked so a metadata refresh keeps the title
    const query = new URLSearchParams({ type: '18', id: collectionId, 'title.value': title, 'title.locked': '1' });
    await handleOneRetryAttempt(() => AxiosRequest.put(`${url}?${query.toString()}`, settings.token));
}
