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

    let added = false;

    const add = (toAdd: SavedItem) => {
        if (!items.some(item => item.uri == toAdd.uri)) {
            items.push(toAdd)
            added = true
        }
    }

    // `items` is a snapshot taken when this job started, so writing it back
    // whole would undo anything removed in the meantime - a sync run is long
    // enough to cover someone deleting an item in the UI. Nothing added means
    // nothing to write.
    const save = () => {
        if (!added)
            return;

        writeFileSync(savedItemsPath, JSON.stringify(items, undefined, 4))
    }

    return { items, add, save };
}