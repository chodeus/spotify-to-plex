import { AxiosRequest } from '@spotify-to-plex/http-client/AxiosRequest';
import { getAPIUrl } from '@spotify-to-plex/shared-utils/utils/getAPIUrl';

/** Throws unless Plex at this connection takes the token: checked before a connection is saved. */
export async function checkPlexConnection(uri: string, token: string) {
    await AxiosRequest.get(getAPIUrl(uri, '/library/sections'), token);
}
