import { AxiosRequest } from '@spotify-to-plex/http-client/AxiosRequest';
import { describeHttpError } from '@spotify-to-plex/http-client/describeHttpError';
import { plexTvClient } from '@spotify-to-plex/http-client/plexTvClient';
import { getSettings } from '@spotify-to-plex/plex-config/functions/getSettings';
import { updateSettings } from '@spotify-to-plex/plex-config/functions/updateSettings';
import { getAPIUrl } from '@spotify-to-plex/shared-utils/utils/getAPIUrl';

type PlexResource = {
    clientIdentifier: string
    accessToken?: string
    httpsRequired?: boolean
    connections?: { local: boolean, relay?: boolean, uri: string }[]
}

type Identity = { MediaContainer?: { machineIdentifier?: string } }

// The saved server answering, not just something at that address: another server there would get this one's keys
async function answersAs(uri: string, token: string, serverId: string) {
    try {
        const result = await AxiosRequest.get<Identity>(getAPIUrl(uri, '/identity'), token);

        return result.data?.MediaContainer?.machineIdentifier === serverId;
    } catch {
        return false;
    }
}

// Local first, then remote, relays last: a remote address goes through the public IP, which changes
function candidatesOf(server: PlexResource, current: string) {
    return (server.connections ?? [])
        .map(({ local, relay, uri }) => ({ local, relay: !!relay, uri: server.httpsRequired ? uri.split('http://').join('https://') : uri }))
        .filter(item => item.uri !== current)
        .sort((a, b) => Number(b.local) - Number(a.local) || Number(a.relay) - Number(b.relay));
}

/**
 * Checks that the saved Plex connection still answers. When it does not, asks plex.tv for the
 * server's current connections and saves the first one that answers as the same server.
 * Never throws: with nothing better found, the saved connection stays and the sync reports its own errors.
 */
export async function ensurePlexConnection() {
    const settings = await getSettings(true);
    const token = settings.serverToken || settings.token;
    if (!settings.uri || !settings.id || !token)
        return;

    if (await answersAs(settings.uri, token, settings.id))
        return;

    if (!settings.token) {
        console.error(`Plex did not answer at ${settings.uri}`);

        return;
    }

    let server: PlexResource | undefined;
    try {
        const result = await plexTvClient.get<PlexResource[]>('https://plex.tv/api/v2/resources', {
            params: {
                "X-Plex-Product": "Spotify to Plex",
                "X-Plex-Client-Identifier": process.env.PLEX_APP_ID,
            },
            headers: { "X-Plex-Token": settings.token },
        });
        server = result.data.find(item => item.clientIdentifier === settings.id);
    } catch (error) {
        console.error(`Plex did not answer at ${settings.uri}, and plex.tv could not list its other connections: ${describeHttpError(error)}`);

        return;
    }

    const serverToken = server?.accessToken || token;

    for (const candidate of server ? candidatesOf(server, settings.uri) : []) {
        if (!await answersAs(candidate.uri, serverToken, settings.id))
            continue;

        try {
            await updateSettings({ uri: candidate.uri, ...(server?.accessToken ? { serverToken: server.accessToken } : {}) });
            console.log(`Plex did not answer at ${settings.uri}; switched to ${candidate.uri}`);
        } catch (error) {
            console.error(`Plex answers at ${candidate.uri}, but the connection could not be saved: ${error instanceof Error ? error.message : String(error)}`);
        }

        return;
    }

    console.error(`Plex did not answer at ${settings.uri}, nor at any other connection plex.tv lists for this server`);
}
