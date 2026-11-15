import { addItemsToCollection } from "@spotify-to-plex/plex-helpers/collection/addItemsToCollection";
import { getCollectionItemKeys } from "@spotify-to-plex/plex-helpers/collection/getCollectionItemKeys";
import { getSectionCollections } from "@spotify-to-plex/plex-helpers/collection/getSectionCollections";
import { removeItemFromCollection } from "@spotify-to-plex/plex-helpers/collection/removeItemFromCollection";
import { renameCollection } from "@spotify-to-plex/plex-helpers/collection/renameCollection";
import { sortCollectionByTitle } from "@spotify-to-plex/plex-helpers/collection/sortCollectionByTitle";
import { storeCollection } from "@spotify-to-plex/plex-helpers/collection/storeCollection";
import { putPlaylistPoster } from "@spotify-to-plex/plex-helpers/playlist/putPlaylistPoster";
import { getLibraryItem } from "@spotify-to-plex/plex-helpers/utils/getLibraryItem";
import { PlexConnection } from "@spotify-to-plex/plex-helpers/utils/plexSettingsFor";
import { addCollection } from "@spotify-to-plex/plex-config/functions/addCollection";
import { getCollections } from "@spotify-to-plex/plex-config/functions/getCollections";
import { SearchResponse } from "@spotify-to-plex/plex-music-search/types/SearchResponse";

/** Brings the playlist's Plex collection in line with its matched tracks, under the playlist's title. */
export async function putPlexCollection(settings: PlexConnection, id: string, result: SearchResponse[], title: string, thumb: string, removeDropped: boolean) {
    const keys = [...new Set(result.map(item => item.result[0]?.id).filter((key): key is string => !!key))];
    const [first] = keys;
    // Nothing matched says nothing about what the collection should hold: leave it as it is
    if (!first)
        return;

    const { data: records = [] } = await getCollections();
    const recorded = records.find(item => item.id === id)?.plex;
    const found = recorded ? await getLibraryItem(settings, `/library/metadata/${recorded}`) : undefined;
    const collection = found?.type === 'collection' ? found : undefined;
    const sectionId = collection?.librarySectionID ?? await sectionOf(settings, keys);

    // Plex ties tracks to a collection by its title, ignoring case: two collections with one title share their tracks
    const others = await getSectionCollections(settings, sectionId);
    const clash = others.find(other => other.ratingKey !== collection?.ratingKey && sameTitle(other.title, title));
    if (clash)
        throw new Error(`Plex already has a collection named "${clash.title}" that spotify-to-plex has no record of: rename or delete it in Plex to sync this playlist as a collection`);

    const collectionId = collection?.ratingKey ?? await createCollection(settings, id, sectionId, title, first);
    if (collection && collection.title !== title)
        await renameCollection(settings, sectionId, collectionId, title);

    const held = new Set(await getCollectionItemKeys(settings, collectionId));
    const wanted = new Set(keys);
    const toAdd = keys.filter(key => !held.has(key));
    await addItemsToCollection(settings, collectionId, toAdd);

    const dropped = [...held].filter(key => !wanted.has(key));
    if (removeDropped) {
        for (const key of dropped)
            await removeItemFromCollection(settings, collectionId, key);
    } else if (dropped.length > 0) {
        console.log(`* Plex did not answer for every track, so ${dropped.length} track(s) stay in the collection until a sync where it does`);
    }

    await logNotAdded(settings, collectionId, toAdd);
    if (!thumb)
        return;

    try {
        await putPlaylistPoster(settings, collectionId, thumb);
    } catch (_e) {
        console.log(`* Could not update the collection poster`);
    }
}

async function createCollection(settings: PlexConnection, id: string, sectionId: number, title: string, firstKey: string) {
    const collectionId = await storeCollection(settings, sectionId, title, firstKey);
    // Recorded before the adds, so a failed add cannot leave a collection the next sync creates again
    await addCollection({ id, plex: collectionId });
    // Once, at create: a sort chosen later in Plex stays
    try {
        await sortCollectionByTitle(settings, collectionId);
    } catch (_e) {
        console.log(`* Could not set the collection to sort by title`);
    }

    return collectionId;
}

async function logNotAdded(settings: PlexConnection, collectionId: string, toAdd: string[]) {
    if (toAdd.length === 0)
        return;

    const now = new Set(await getCollectionItemKeys(settings, collectionId));
    const notAdded = toAdd.filter(key => !now.has(key));
    if (notAdded.length > 0)
        console.log(`* Plex did not add ${notAdded.length} track(s) to the collection: ${notAdded.join(', ')}`);
}

// A cached link can point at a track Plex has since replaced (a re-import gives it a new key)
async function sectionOf(settings: PlexConnection, keys: string[]) {
    for (const key of keys) {
        const item = await getLibraryItem(settings, key);
        if (item?.librarySectionID)
            return item.librarySectionID;
    }

    throw new Error(`Plex has none of the playlist's ${keys.length} matched track(s) in its library`);
}

// Folds widely on purpose: a false match only refuses the sync, a missed one would strip the other collection's tracks
function sameTitle(a: string, b: string) {
    const fold = (title: string) => title.normalize('NFKC').replaceAll(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    return fold(a) === fold(b);
}
