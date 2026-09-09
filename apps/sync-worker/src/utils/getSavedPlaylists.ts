import { getStorageDir } from '@spotify-to-plex/shared-utils/utils/getStorageDir';
import { SavedItem } from "@spotify-to-plex/shared-types/spotify/SavedItem";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function getSavedPlaylists() {

    // Get all saved items
    // Nothing enrolled is a job with nothing to do, not a failure
    const savedItemsPath = join(getStorageDir(), 'spotify_saved_items.json');
    if (!existsSync(savedItemsPath))
        return { toSyncPlaylists: [] };

    const savedItems: SavedItem[] = JSON.parse(readFileSync(savedItemsPath, 'utf8'));
    const toSyncPlaylists = savedItems.filter(item => !!item.sync && item.type == 'spotify-playlist');

    return { toSyncPlaylists };
}
