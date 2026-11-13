import { AxiosRequest } from '@spotify-to-plex/http-client/AxiosRequest';
import { GetPlaylistResponse } from '@spotify-to-plex/shared-types/plex/GetPlaylistResponse';
import { Playlist } from '@spotify-to-plex/shared-types/plex/Playlist';
import { getAPIUrl } from '@spotify-to-plex/shared-utils/utils/getAPIUrl';
import { handleOneRetryAttempt } from '../retry';

/** The playlist with this ratingKey among those the token's Plex account can see. */
export async function findPlaylist(plex: { readonly uri: string, readonly token: string }, ratingKey?: string): Promise<Playlist | undefined> {
    if (!ratingKey)
        return undefined;

    const url = getAPIUrl(plex.uri, `/playlists`);
    const result = await handleOneRetryAttempt<GetPlaylistResponse>(() => AxiosRequest.get(url, plex.token));

    return (result.data.MediaContainer.Metadata ?? []).find((item: Playlist) => item.ratingKey == ratingKey);
}
