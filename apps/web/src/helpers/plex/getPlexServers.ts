import { plexTvClient } from '@spotify-to-plex/http-client/plexTvClient';

type PlexResource = {
    product: string
    name: string
    clientIdentifier: string
    accessToken: string
    httpsRequired?: boolean
    connections: { local: boolean, uri: string }[]
}

/** The account's Plex Media Servers from plex.tv, each with its own access token: keep the result on the server. */
export async function getPlexServers(accountToken: string) {
    const result = await plexTvClient.get<PlexResource[]>(`https://plex.tv/api/v2/resources`, {
        params: {
            "X-Plex-Product": "Spotify to Plex",
            "X-Plex-Client-Identifier": process.env.PLEX_APP_ID,
            "X-Plex-Token": accountToken,
        }
    });

    return result.data
        .filter(item => item.product === "Plex Media Server")
        .map(({ name, clientIdentifier, accessToken, httpsRequired, connections }) => ({
            name,
            id: clientIdentifier,
            accessToken,
            connections: connections.map(({ local, uri }) => ({ local, uri: httpsRequired ? uri.split('http://').join('https://') : uri }))
        }));
}
