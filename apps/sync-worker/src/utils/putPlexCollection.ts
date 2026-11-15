import { addItemsToCollection } from "@spotify-to-plex/plex-helpers/collection/addItemsToCollection";
import { getCollectionItemKeys } from "@spotify-to-plex/plex-helpers/collection/getCollectionItemKeys";
import { getSectionCollections } from "@spotify-to-plex/plex-helpers/collection/getSectionCollections";
import { removeItemFromCollection } from "@spotify-to-plex/plex-helpers/collection/removeItemFromCollection";
import { renameCollection } from "@spotify-to-plex/plex-helpers/collection/renameCollection";
import { storeCollection } from "@spotify-to-plex/plex-helpers/collection/storeCollection";
import { putPlaylistPoster } from "@spotify-to-plex/plex-helpers/playlist/putPlaylistPoster";
import { getLibraryItem } from "@spotify-to-plex/plex-helpers/utils/getLibraryItem";
import { PlexConnection } from "@spotify-to-plex/plex-helpers/utils/plexSettingsFor";
import { addCollection } from "@spotify-to-plex/plex-config/functions/addCollection";
import { getCollections } from "@spotify-to-plex/plex-config/functions/getCollections";
import { SearchResponse } from "@spotify-to-plex/plex-music-search/types/SearchResponse";

/** Makes the playlist's Plex collection hold exactly its matched tracks, under the playlist's title. */
export async function putPlexCollection(settings: PlexConnection, id: string, result: SearchResponse[], title: string, thumb: string) {
    const keys = [...new Set(result.map(item => item.result[0]?.id).filter((key): key is string => !!key))];
    const [first] = keys;
    // Nothing matched says nothing about what the collection should hold: leave it as it is
    if (!first)
        return;

    const { data: records = [] } = await getCollections();
    const recorded = records.find(item => item.id === id)?.plex;
    const found = recorded ? await getLibraryItem(settings, `/library/metadata/${recorded}`) : undefined;
    const collection = found?.type === 'collection' ? found : undefined;
    const sectionId = collection?.librarySectionID ?? await sectionOf(settings, first);

    // Plex ties tracks to a collection by its title, ignoring case: two collections with one title share their tracks
    const others = await getSectionCollections(settings, sectionId);
    const clash = others.find(other => other.ratingKey !== collection?.ratingKey && sameTitle(other.title, title));
    if (clash)
        throw new Error(`Plex already has a collection named "${clash.title}"; rename it or this playlist to sync the playlist as a collection`);

    const collectionId = collection?.ratingKey ?? await createCollection(settings, id, sectionId, title, first);
    if (collection && collection.title !== title)
        await renameCollection(settings, sectionId, collectionId, title);

    const held = new Set(await getCollectionItemKeys(settings, collectionId));
    const wanted = new Set(keys);
    await addItemsToCollection(settings, collectionId, keys.filter(key => !held.has(key)));

    for (const key of held) {
        if (!wanted.has(key))
            await removeItemFromCollection(settings, collectionId, key);
    }

    const now = new Set(await getCollectionItemKeys(settings, collectionId));
    const notAdded = keys.filter(key => !now.has(key));
    if (notAdded.length > 0)
        console.log(`* Plex did not add ${notAdded.length} track(s) to the collection: ${notAdded.join(', ')}`);

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

    return collectionId;
}

async function sectionOf(settings: PlexConnection, key: string) {
    const item = await getLibraryItem(settings, key);
    if (!item?.librarySectionID)
        throw new Error(`Plex did not say which library holds ${key}`);

    return item.librarySectionID;
}

function sameTitle(a: string, b: string) {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}
