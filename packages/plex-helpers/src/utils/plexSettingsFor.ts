import { plexTvClient } from '@spotify-to-plex/http-client/plexTvClient';
import { getSettings } from '@spotify-to-plex/plex-config/functions/getSettings';
import { SavedItem } from '@spotify-to-plex/shared-types/spotify/SavedItem';
import { SpotifyCredentials } from '@spotify-to-plex/shared-types/spotify/SpotifyCredentials';
import { readJSON } from '@spotify-to-plex/plex-config/utils/fileUtils';

export type PlexConnection = { id: string, uri: string, token: string }
export type PlexHomeUser = { uuid: string, title: string, admin: boolean, protected: boolean }

const TOKEN_TTL_MS = 60 * 60 * 1000;
const homeUserTokens = new Map<string, { token: string, at: number }>();

function plexTvParams(token: string) {
    return {
        "X-Plex-Product": "Spotify to Plex",
        "X-Plex-Client-Identifier": process.env.PLEX_APP_ID,
        "X-Plex-Token": token,
    };
}

/** The Plex connection a Spotify user's playlists are read and written with: the owner's unless a Home user is set. */
export async function plexSettingsForUser(spotifyUserId?: string): Promise<PlexConnection> {
    const settings = await getSettings();
    if (!settings.uri || !settings.token || !settings.id)
        throw new Error('Plex settings not configured properly');

    const credentials = spotifyUserId ? await readJSON<SpotifyCredentials[]>('spotify.json') : null;
    const homeUser = credentials?.find(item => item.user.id === spotifyUserId)?.user.plex_home_user;
    if (!homeUser)
        return { id: settings.id, uri: settings.uri, token: settings.token };

    // Never the owner's token instead: that would put the playlist in the wrong account
    return { id: settings.id, uri: settings.uri, token: await homeUserServerToken(homeUser.uuid, settings.id) };
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
    const result = await plexTvClient.get<{ users?: PlexHomeUser[] }>('https://plex.tv/api/v2/home/users', { params: plexTvParams(token) });

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
        { params: plexTvParams(accountToken) }
    );
    const userToken = switched.data.authToken;
    if (!userToken)
        throw new Error('plex.tv did not switch to the Plex Home user');

    const resources = await plexTvClient.get<{ clientIdentifier: string, accessToken?: string }[]>(
        'https://plex.tv/api/v2/resources',
        { params: plexTvParams(userToken) }
    );
    const token = resources.data.find(item => item.clientIdentifier === serverId)?.accessToken;
    if (!token)
        throw new Error('The Plex Home user has no access to this Plex server');

    homeUserTokens.set(key, { token, at: Date.now() });

    return token;
}
