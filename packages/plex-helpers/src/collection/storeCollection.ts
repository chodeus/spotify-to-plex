import { AxiosRequest } from '@spotify-to-plex/http-client/AxiosRequest';
import { getAPIUrl } from '@spotify-to-plex/shared-utils/utils/getAPIUrl';
import { PlexSettings } from '../PlexSettings';
import { getPlexUri } from '../utils/getPlexUri';
import { validatePlexSettings } from '../utils/validatePlexSettings';

type CreateCollectionResponse = {
    MediaContainer?: {
        Metadata?: { ratingKey?: string }[];
    };
};

/** Creates a track collection in a library section holding one track, and returns its ratingKey. */
export async function storeCollection(settings: PlexSettings, sectionId: number, title: string, firstKey: string) {
    validatePlexSettings(settings);

    const url = getAPIUrl(settings.uri, `/library/collections`);
    // type 10 = tracks
    const query = new URLSearchParams({
        type: '10',
        title,
        smart: '0',
        sectionId: String(sectionId),
        uri: getPlexUri(settings, firstKey)
    });

    const result = await AxiosRequest.post<CreateCollectionResponse>(`${url}?${query.toString()}`, settings.token);
    const id = result.data?.MediaContainer?.Metadata?.[0]?.ratingKey;
    if (!id)
        throw new Error('Failed to create collection - no ID returned');

    return id;
}
