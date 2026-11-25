import { plexTvClient } from '@spotify-to-plex/http-client/plexTvClient';
import { plexTvRequest } from './plexTvRequest';

type PlexResource = {
    product: string
    name: string
    clientIdentifier: string
    accessToken: string
    httpsRequired?: boolean
    connections: { local: boolean, relay?: boolean, uri: string }[]
}

/** The account's Plex Media Servers from plex.tv, each with its own access token: keep the result on the server. */
export async function getPlexServers(accountToken: string) {
    const result = await plexTvClient.get<PlexResource[]>('https://plex.tv/api/v2/resources', plexTvRequest(accountToken));

    return result.data
        .filter(item => item.product === "Plex Media Server")
        .map(({ name, clientIdentifier, accessToken, httpsRequired, connections }) => ({
            name,
            id: clientIdentifier,
            accessToken,
            // Local first: a remote address may change with the public IP or not answer from inside the same network
            connections: connections
                .map(({ local, relay, uri }) => ({ local, relay: !!relay, uri: httpsRequired ? uri.split('http://').join('https://') : uri }))
                .sort((a, b) => Number(b.local) - Number(a.local))
        }));
}
