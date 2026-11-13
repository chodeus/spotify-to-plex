import { httpStatusOf } from '@spotify-to-plex/http-client/httpStatusOf';
import { plexTvClient } from '@spotify-to-plex/http-client/plexTvClient';
import { getSettings } from '@spotify-to-plex/plex-config/functions/getSettings';
import { SavedItem } from '@spotify-to-plex/shared-types/spotify/SavedItem';
import { SpotifyCredentials } from '@spotify-to-plex/shared-types/spotify/SpotifyCredentials';
import { readJSON } from '@spotify-to-plex/plex-config/utils/fileUtils';

// homeUser is the Plex Home user's uuid when the token is theirs, not the owner's
export type PlexConnection = { id: string, uri: string, token: string, homeUser?: string }
export type PlexHomeUser = { uuid: string, title: string, admin: boolean, protected: boolean }

const TOKEN_TTL_MS = 60 * 60 * 1000;
const homeUserTokens = new Map<string, { token: string, at: number }>();

// The token goes in a header, never the URL, where request logs would keep it
function plexTvRequest(token: string) {
    return {
        params: {
            "X-Plex-Product": "Spotify to Plex",
            "X-Plex-Client-Identifier": process.env.PLEX_APP_ID,
        },
        headers: { "X-Plex-Token": token },
    };
}

/** The Plex connection a Spotify user's playlists are read and written with: the owner's unless a Home user is set. */
export async function plexSettingsForUser(spotifyUserId?: string): Promise<PlexConnection> {
    const settings = await getSettings();
    if (!settings.uri || !settings.token || !settings.id)
        throw new Error('Plex settings not configured properly');

    const homeUser = await plexHomeUserOf(spotifyUserId);
    if (!homeUser)
        return { id: settings.id, uri: settings.uri, token: settings.token };

    // Never the owner's token instead: that would put the playlist in the wrong account
    return { id: settings.id, uri: settings.uri, token: await homeUserServerToken(homeUser.uuid, settings.id), homeUser: homeUser.uuid };
}

/** The Plex Home user a Spotify user's playlists are made as, if one is set. */
export async function plexHomeUserOf(spotifyUserId?: string) {
    const credentials = spotifyUserId ? await readJSON<SpotifyCredentials[]>('spotify.json') : null;

    return credentials?.find(item => item.user.id === spotifyUserId)?.user.plex_home_user;
}

/** Runs Plex calls with a connection; a Home user's token Plex rejects is fetched again and the calls run once more. */
export async function withPlexConnection<T>(connect: () => Promise<PlexConnection>, run: (connection: PlexConnection) => Promise<T>) {
    const connection = await connect();
    try {
        return await run(connection);
    } catch (error) {
        if (!connection.homeUser || httpStatusOf(error) !== 401)
            throw error;

        forgetHomeUserToken(connection.homeUser);

        return run(await connect());
    }
}

function forgetHomeUserToken(uuid: string) {
    for (const key of homeUserTokens.keys()) {
        if (key.startsWith(`${uuid}@`))
            homeUserTokens.delete(key);
    }
}

/** plexSettingsForUser for the Spotify user a saved item came from. */
export async function plexSettingsForItem(savedItemId: string) {
    const items = await readJSON<SavedItem[]>('spotify_saved_items.json');

    return plexSettingsForUser(items?.find(item => item.id === savedItemId)?.user);
}

export async function getPlexHomeUsers(): Promise<PlexHomeUser[]> {
    const { token } = await getSettings(true);
    if (!token)
        throw new Error('Plex settings not configured properly');

    // An object with the account's fields and a users array, not a bare array
    const result = await plexTvClient.get<{ users?: PlexHomeUser[] }>('https://plex.tv/api/v2/home/users', plexTvRequest(token));

    return (result.data.users ?? []).map(({ uuid, title, admin, protected: isProtected }) => ({ uuid, title, admin: !!admin, protected: !!isProtected }));
}

// The owner and PIN-protected users can't be picked: the owner is the default, and a PIN can't be stored
export async function findPickableHomeUser(uuid: string) {
    const homeUsers = await getPlexHomeUsers();

    return homeUsers.find(item => item.uuid === uuid && !item.admin && !item.protected);
}

async function homeUserServerToken(uuid: string, serverId: string) {
    const { token: accountToken } = await getSettings(true);
    if (!accountToken)
        throw new Error('Plex settings not configured properly');

    // Keyed by the owner account too: signing in as another account must not reuse the old one's tokens
    const key = `${uuid}@${serverId}@${accountToken}`;
    const cached = homeUserTokens.get(key);
    if (cached && Date.now() - cached.at < TOKEN_TTL_MS)
        return cached.token;

    const switched = await plexTvClient.post<{ authToken?: string }>(
        `https://plex.tv/api/v2/home/users/${encodeURIComponent(uuid)}/switch`,
        undefined,
        plexTvRequest(accountToken)
    );
    const userToken = switched.data.authToken;
    if (!userToken)
        throw new Error('plex.tv did not switch to the Plex Home user');

    const resources = await plexTvClient.get<{ clientIdentifier: string, accessToken?: string }[]>(
        'https://plex.tv/api/v2/resources',
        plexTvRequest(userToken)
    );
    const token = resources.data.find(item => item.clientIdentifier === serverId)?.accessToken;
    if (!token)
        throw new Error('The Plex Home user has no access to this Plex server');

    homeUserTokens.set(key, { token, at: Date.now() });

    return token;
}
