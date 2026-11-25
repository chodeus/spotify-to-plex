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

// The check the settings page makes before it saves a connection
async function acceptsToken(uri: string, token: string) {
    try {
        await AxiosRequest.get(getAPIUrl(uri, '/library/sections'), token);

        return true;
    } catch {
        return false;
    }
}

// All asked at once; the first in the list's order wins
async function firstWorking(uris: string[], serverId: string, token: string) {
    const works = await Promise.all(uris.map(async uri => await answersAs(uri, serverId) && await acceptsToken(uri, token)));

    return uris.find((_, index) => works[index]);
}

/** Before a sync: when the saved Plex connection does not answer and plex.tv no longer lists it, saves a direct connection of the same server that works. */
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

    // A connection plex.tv still lists is down for now, not gone: it stays the user's choice
    if (server.connections.some(item => item.uri === settings.uri)) {
        console.error(`Plex did not answer at ${settings.uri}, a connection plex.tv still lists for this server, so it is kept`);

        return;
    }

    // A relay stays a choice made by hand: it is slow
    const direct = server.connections.filter(item => !item.relay).map(item => item.uri);
    const uri = await firstWorking(direct, settings.id, server.accessToken);
    if (!uri) {
        console.error(`Plex did not answer at ${settings.uri}, and no direct connection plex.tv lists for this server works`);

        return;
    }

    try {
        await updateSettings({ uri, serverToken: server.accessToken }, settings);
        console.log(`Plex did not answer at ${settings.uri}, which plex.tv no longer lists; switched to ${uri}`);
    } catch (error) {
        console.error(`Plex answers at ${uri}, but the connection could not be saved: ${describeHttpError(error)}`);
    }
}
