import { getStorageDir } from '@spotify-to-plex/shared-utils/utils/getStorageDir';
import { SavedItem } from "@spotify-to-plex/shared-types/spotify/SavedItem";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function savedItemsHelpers() {

    // Get all saved items
    const savedItemsPath = join(getStorageDir(), 'spotify_saved_items.json');

    let items: SavedItem[] = []
    if (existsSync(savedItemsPath))
        items = JSON.parse(readFileSync(savedItemsPath, 'utf8'));

    const additions: SavedItem[] = []

    const add = (toAdd: SavedItem) => {
        if (!items.some(item => item.uri == toAdd.uri)) {
            items.push(toAdd)
            additions.push(toAdd)
        }
    }

    /**
     * `items` is a snapshot from when this job started, and a run is long enough
     * to cover someone deleting an item in the UI - writing the snapshot back
     * whole would resurrect it. Re-read and append only what is genuinely new.
     */
    const save = () => {
        if (additions.length == 0)
            return;

        const current: SavedItem[] = existsSync(savedItemsPath)
            ? JSON.parse(readFileSync(savedItemsPath, 'utf8'))
            : [];

        const toAppend = additions.filter(item => !current.some(existing => existing.uri == item.uri));
        if (toAppend.length == 0)
            return;

        writeFileSync(savedItemsPath, JSON.stringify([...current, ...toAppend], undefined, 4))
    }

    return { items, add, save };
}