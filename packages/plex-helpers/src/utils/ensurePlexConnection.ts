import { AxiosRequest } from '@spotify-to-plex/http-client/AxiosRequest';
import { describeHttpError } from '@spotify-to-plex/http-client/describeHttpError';
import { getSettings } from '@spotify-to-plex/plex-config/functions/getSettings';
import { updateSettings } from '@spotify-to-plex/plex-config/functions/updateSettings';
import type { PlexSettings } from '@spotify-to-plex/plex-config/types/PlexSettings';
import { getAPIUrl } from '@spotify-to-plex/shared-utils/utils/getAPIUrl';
import { checkPlexConnection } from './checkPlexConnection';
import { getPlexServers } from './getPlexServers';

type Identity = { MediaContainer?: { machineIdentifier?: string } }

// No token: /identity answers without one, and a host must not get it before it answers as the saved server
async function machineAt(uri: string) {
    try {
        const result = await AxiosRequest.get<Identity>(getAPIUrl(uri, '/identity'), '');

        return result.data?.MediaContainer?.machineIdentifier ?? '';
    } catch {
        return '';
    }
}

async function takesToken(uri: string, token: string) {
    try {
        await checkPlexConnection(uri, token);

        return true;
    } catch {
        return false;
    }
}

// All asked at once; the first in the list's order wins
async function firstAnswering(uris: string[], serverId: string) {
    const machines = await Promise.all(uris.map(uri => machineAt(uri)));

    return uris.find((_, index) => machines[index] === serverId) ?? '';
}

// True once another connection of the saved server is saved
async function recover(settings: PlexSettings, problem: string) {
    if (!settings.token) {
        console.error(problem);

        return false;
    }

    let servers;
    try {
        servers = await getPlexServers(settings.token);
    } catch (error) {
        console.error(`${problem}, and plex.tv could not list the saved server's other connections: ${describeHttpError(error)}`);

        return false;
    }

    const server = servers.find(item => item.id === settings.id);
    if (!server) {
        console.error(`${problem}, and plex.tv does not list the saved server for the signed-in Plex account`);

        return false;
    }

    // A connection plex.tv still lists stays the user's choice: it may be down only for now
    if (server.connections.some(item => item.uri === settings.uri)) {
        console.error(`${problem}, a connection plex.tv still lists for the saved server, so it is kept`);

        return false;
    }

    // A relay stays a choice made by hand: it is slow
    const direct = server.connections.filter(item => !item.relay).map(item => item.uri);
    const uri = await firstAnswering(direct, settings.id);
    if (!uri) {
        console.error(`${problem}, and no direct connection plex.tv lists answers as the saved server`);

        return false;
    }

    // The token goes to this one only: another host can answer with the same identity
    if (!await takesToken(uri, server.accessToken)) {
        console.error(`${problem}, and ${uri} answers as the saved server but refuses its token`);

        return false;
    }

    try {
        await updateSettings({ uri, serverToken: server.accessToken }, settings);
        console.log(`${problem}, which plex.tv no longer lists; switched to ${uri}`);

        return true;
    } catch (error) {
        console.error(`Plex answers at ${uri}, but the connection could not be saved: ${describeHttpError(error)}`);

        return false;
    }
}

/** Before a sync: replaces a dead saved Plex connection plex.tv no longer lists; throws when left where another server answers. */
export async function ensurePlexConnection() {
    const settings = await getSettings(true);
    if (!settings.uri || !settings.id)
        return;

    const machine = await machineAt(settings.uri);
    if (machine === settings.id)
        return;

    const problem = machine ? `Another Plex server answers at ${settings.uri}` : `Plex did not answer at ${settings.uri}`;
    // Another server gives the saved item numbers to its own items: a sync must not write there
    if (!await recover(settings, problem) && machine)
        throw new Error(`${problem}: choose the Plex server again on the Settings page`);
}
