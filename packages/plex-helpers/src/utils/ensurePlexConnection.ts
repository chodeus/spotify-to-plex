import { AxiosRequest } from '@spotify-to-plex/http-client/AxiosRequest';
import { describeHttpError } from '@spotify-to-plex/http-client/describeHttpError';
import { getSettings } from '@spotify-to-plex/plex-config/functions/getSettings';
import { updateSettings } from '@spotify-to-plex/plex-config/functions/updateSettings';
import { getAPIUrl } from '@spotify-to-plex/shared-utils/utils/getAPIUrl';
import { getPlexServers } from './getPlexServers';

type Identity = { MediaContainer?: { machineIdentifier?: string } }

// No token: /identity answers without one, and a host must not get it before it answers as the saved server
async function answersAs(uri: string, serverId: string) {
    try {
        const result = await AxiosRequest.get<Identity>(getAPIUrl(uri, '/identity'), '');

        return result.data?.MediaContainer?.machineIdentifier === serverId;
    } catch {
        return false;
    }
}

/** Before a sync: when the saved Plex connection does not answer, saves another direct connection of the same server that does. */
export async function ensurePlexConnection() {
    const settings = await getSettings(true);
    if (!settings.uri || !settings.id)
        return;

    if (await answersAs(settings.uri, settings.id))
        return;

    if (!settings.token) {
        console.error(`Plex did not answer at ${settings.uri}`);

        return;
    }

    let servers;
    try {
        servers = await getPlexServers(settings.token);
    } catch (error) {
        console.error(`Plex did not answer at ${settings.uri}, and plex.tv could not list its other connections: ${describeHttpError(error)}`);

        return;
    }

    const server = servers.find(item => item.id === settings.id);
    if (!server) {
        console.error(`Plex did not answer at ${settings.uri}, and plex.tv does not list this server for the signed-in Plex account`);

        return;
    }

    // The saved one is asked again: one missed answer must not replace it. A relay stays a choice made by hand, it is slow
    const uris = [settings.uri, ...server.connections.filter(item => !item.relay && item.uri !== settings.uri).map(item => item.uri)];
    const answers = await Promise.all(uris.map(uri => answersAs(uri, settings.id)));
    const uri = uris.find((_, index) => answers[index]);
    if (uri === settings.uri)
        return;

    if (!uri) {
        console.error(`Plex did not answer at ${settings.uri}, nor at any other direct connection plex.tv lists for this server`);

        return;
    }

    try {
        await updateSettings({ uri, ...(server.accessToken ? { serverToken: server.accessToken } : {}) }, settings);
        console.log(`Plex did not answer at ${settings.uri}; switched to ${uri}`);
    } catch (error) {
        console.error(`Plex answers at ${uri}, but the connection could not be saved: ${error instanceof Error ? error.message : String(error)}`);
    }
}
