import { getAPIUrl } from '@spotify-to-plex/shared-utils/utils/getAPIUrl';

/** Plex Web's page for a playlist; none for a Plex Home user's, since Plex Web opens as the owner who can't see it. */
export function getPlaylistLink(settings: { readonly uri: string, readonly id: string }, ratingKey: string, homeUser?: string) {
    if (homeUser)
        return;

    return getAPIUrl(settings.uri, `/web/index.html#!/server/${settings.id}/playlist?key=${encodeURIComponent(`/playlists/${ratingKey}`)}`);
}
