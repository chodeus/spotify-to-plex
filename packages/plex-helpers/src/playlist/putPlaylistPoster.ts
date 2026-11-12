import { AxiosRequest } from '@spotify-to-plex/http-client/AxiosRequest';
import { handleOneRetryAttempt } from '../retry';
import { getAPIUrl } from '@spotify-to-plex/shared-utils/utils/getAPIUrl';

type PlexConnection = { readonly uri: string, readonly token: string }

// Takes the connection: a Plex Home user's playlist is only reachable with that user's token
export async function putPlaylistPoster(settings: PlexConnection, id: string, image: string) {
    let posters = await getPosters(settings, id);
    const uploadOnly = posters.size == 1;
    await uploadPoster(settings, id, image);

    if (uploadOnly)
        return;

    posters = await getPosters(settings, id);
    // @ts-expect-error Needs some refactoring (typing missing)
    const uploadedPoster = posters.Metadata.find(item => item.key.indexOf('upload') > -1)
    await putPoster(settings, id, uploadedPoster.ratingKey)

}

export async function getPlaylist(settings: PlexConnection, id: string) {
    const { token, uri } = settings;
    if (!token || !uri)
        throw new Error('Plex settings not configured properly');

    const url = getAPIUrl(uri, `/library/metadata/${id}`);
    const currentPlaylist = await handleOneRetryAttempt(() => AxiosRequest.get<any>(url, token))

    return currentPlaylist.data.MediaContainer.Metadata[0];
}
async function getPosters(settings: PlexConnection, id: string) {
    const { token, uri } = settings;
    if (!token || !uri)
        throw new Error('Plex settings not configured properly');

    const url = getAPIUrl(uri, `/library/metadata/${id}/posters`);
    const currentPosters = await handleOneRetryAttempt(() => AxiosRequest.get<any>(url, token))

    return currentPosters.data.MediaContainer;
}
async function putPoster(settings: PlexConnection, id: string, uploadUrl: string) {
    const { token, uri } = settings;
    if (!token || !uri)
        throw new Error('Plex settings not configured properly');

    const url = getAPIUrl(uri, `/library/metadata/${id}/poster?url=${encodeURIComponent(uploadUrl)}`);

    return handleOneRetryAttempt(() => AxiosRequest.put<any>(url, token))
}

async function uploadPoster(settings: PlexConnection, id: string, image: string) {
    const { token, uri } = settings;
    if (!token || !uri)
        throw new Error('Plex settings not configured properly');

    const url = getAPIUrl(uri, `/library/metadata/${id}/posters?url=${encodeURIComponent(image)}`);

    return AxiosRequest.post<any>(url, token)
}