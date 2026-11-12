import { addItemsToPlaylist } from "@spotify-to-plex/plex-helpers/playlist/addItemsToPlaylist";
import { getPlaylistItemKeys } from "@spotify-to-plex/plex-helpers/playlist/getPlaylistItemKeys";
import { putPlaylistPoster } from "@spotify-to-plex/plex-helpers/playlist/putPlaylistPoster";
import { removeItemsFromPlaylist } from "@spotify-to-plex/plex-helpers/playlist/removeItemsFromPlaylist";
import { storePlaylist } from "@spotify-to-plex/plex-helpers/playlist/storePlaylist";
import { updatePlaylist } from "@spotify-to-plex/plex-helpers/playlist/updatePlaylist";
import { getPlexUri } from "@spotify-to-plex/plex-helpers/utils/getPlexUri";
import { Playlist } from "@spotify-to-plex/shared-types/plex/Playlist";
import { SearchResponse } from "@spotify-to-plex/plex-music-search/types/SearchResponse";
import { PlexConnection } from "@spotify-to-plex/plex-helpers/utils/plexSettingsFor";
import { addPlaylist } from "@spotify-to-plex/plex-config/functions/addPlaylist";

export async function putPlexPlaylist(settings: PlexConnection, id: string, plexPlaylist: Playlist | undefined | null, result: SearchResponse[], title: string, thumb: string) {
    const plexTracks = result.map(item => {
        if (item.result.length == 0)
            return null;

        const [firstResult] = item.result;
        if (!firstResult) return null;

        return {
            key: firstResult.id,
            source: firstResult.source
        };
    }).filter(item => !!item);

    const [firstItem] = plexTracks;
    if (firstItem) {
        if (plexPlaylist) {
            console.log(`Update existing playlist`);
            // Rewriting empties the playlist until every add lands, so skip it when nothing changed
            const current = await getPlaylistItemKeys(settings, plexPlaylist.ratingKey);
            const unchanged = current.length == plexTracks.length && current.every((key, index) => key == plexTracks[index]?.key);
            if (!unchanged) {
                await removeItemsFromPlaylist(settings, plexPlaylist.ratingKey, []);
                logRefused(await addItemsToPlaylist(settings, plexPlaylist.ratingKey, plexTracks));
            }

            if (plexPlaylist.title != title && title)
                await updatePlaylist(settings, plexPlaylist.ratingKey, { title });

            try {
                await putPlaylistPoster(settings, plexPlaylist.ratingKey, thumb)
            } catch (_e) {
                console.log(`* Could not update poster image`)
            }
        } else {
            console.log(`Create new playlist`);
            const uri = getPlexUri(settings, firstItem.key, firstItem.source);
            const playlistId = await storePlaylist(settings, title, uri);
            // Recorded before the adds, so a failed add cannot leave a playlist the next sync creates again
            await addPlaylist({ type: 'playlist', id, plex: playlistId });
            // storePlaylist already added the first track
            logRefused(await addItemsToPlaylist(settings, playlistId, plexTracks.slice(1)));

            try {
                await putPlaylistPoster(settings, playlistId, thumb)
            } catch (_e) {
                console.log(`** Could not update poster image`)
            }
        }
    }
}

function logRefused(keys: string[]) {
    if (keys.length > 0)
        console.log(`* Plex refused ${keys.length} track(s): ${keys.join(', ')}`);
}
