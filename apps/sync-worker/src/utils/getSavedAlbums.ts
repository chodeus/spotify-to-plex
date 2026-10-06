import { getStorageDir } from '@spotify-to-plex/shared-utils/utils/getStorageDir';
import { SavedItem } from "@spotify-to-plex/shared-types/spotify/SavedItem";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function getSavedAlbums() {

    // Get all saved items
    // Nothing enrolled is a job with nothing to do, not a failure - throwing
    // here marked the nightly sync red for as long as no album was enrolled
    const savedItemsPath = join(getStorageDir(), 'spotify_saved_items.json');
    if (!existsSync(savedItemsPath))
        return { toSyncAlbums: [] };

    const savedItems: SavedItem[] = JSON.parse(readFileSync(savedItemsPath, 'utf8'));
    const toSyncAlbums = savedItems.filter(item => !!item.sync && item.type == 'spotify-album');

    return { toSyncAlbums };
}
