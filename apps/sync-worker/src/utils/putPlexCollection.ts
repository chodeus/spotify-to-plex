import { addItemsToCollection } from "@spotify-to-plex/plex-helpers/collection/addItemsToCollection";
import { getCollectionItemKeys } from "@spotify-to-plex/plex-helpers/collection/getCollectionItemKeys";
import { getSectionCollections } from "@spotify-to-plex/plex-helpers/collection/getSectionCollections";
import { removeItemFromCollection } from "@spotify-to-plex/plex-helpers/collection/removeItemFromCollection";
import { renameCollection } from "@spotify-to-plex/plex-helpers/collection/renameCollection";
import { sortCollectionByTitle } from "@spotify-to-plex/plex-helpers/collection/sortCollectionByTitle";
import { storeCollection } from "@spotify-to-plex/plex-helpers/collection/storeCollection";
import { putPlaylistPoster } from "@spotify-to-plex/plex-helpers/playlist/putPlaylistPoster";
import { getLibraryItems, LibraryItem } from "@spotify-to-plex/plex-helpers/utils/getLibraryItems";
import { ratingKeyOf } from "@spotify-to-plex/plex-helpers/utils/ratingKeyOf";
import { PlexConnection } from "@spotify-to-plex/plex-helpers/utils/plexSettingsFor";
import { addCollection } from "@spotify-to-plex/plex-config/functions/addCollection";
import { getCollections } from "@spotify-to-plex/plex-config/functions/getCollections";
import { keepCollections } from "@spotify-to-plex/plex-config/functions/keepCollections";

type Target = { id: string, title: string, thumb: string, records: readonly { id: string, plex: string }[] };

/** Brings the playlist's Plex collections in line with its matched tracks and title: one per music library it has tracks in. */
export async function putPlexCollection(settings: PlexConnection, id: string, trackKeys: string[], title: string, thumb: string) {
    const keys = [...new Set(trackKeys)];
    // Nothing matched says nothing about what the collections should hold: leave them as they are
    if (keys.length === 0)
        return;

    const sections = await sectionsOf(settings, keys);
    const { data: records = [] } = await getCollections();
    const recorded = records.filter(item => item.id === id).map(item => item.plex);
    const recordedItems = await getLibraryItems(settings, recorded);
    const owned = recordedItems.filter(item => item.type === 'collection');
    if (owned.length < recorded.length)
        await keepCollections(id, owned.map(item => item.ratingKey));

    const target = { id, title, thumb, records };
    // A clash or failure in one library is no reason to leave the others behind
    const failures: unknown[] = [];
    const attempt = (step: Promise<void>) => step.catch((error: unknown) => { failures.push(error) });

    for (const [sectionId, sectionKeys] of sections)
        await attempt(putSectionCollection(settings, target, sectionId, owned.find(item => item.librarySectionID === sectionId), sectionKeys));

    // A library the playlist has no tracks in any more keeps its collection, emptied, under the title it had
    for (const collection of owned.filter(item => item.librarySectionID === undefined || !sections.has(item.librarySectionID)))
        await attempt(fillCollection(settings, collection.ratingKey, []));

    if (failures.length === 1)
        throw failures[0];

    if (failures.length > 1)
        throw new Error(failures.map(error => error instanceof Error ? error.message : String(error)).join('; '));
}

// Plex keeps a collection to one library, so the tracks go to the collection in their own library
async function sectionsOf(settings: PlexConnection, keys: string[]) {
    const items = await getLibraryItems(settings, keys);
    const found = new Map(items.map(item => [item.ratingKey, item.librarySectionID]));
    const sections = new Map<number, [string, ...string[]]>();
    const gone: string[] = [];

    for (const key of keys) {
        const section = found.get(ratingKeyOf(key));
        const held = section === undefined ? undefined : sections.get(section);
        if (section === undefined)
            gone.push(key);
        else if (held)
            held.push(key);
        else
            sections.set(section, [key]);
    }

    // A cached link can point at a track Plex has since replaced (a re-import gives it a new key)
    if (sections.size === 0)
        throw new Error(`Plex has none of the playlist's ${keys.length} matched track(s) in its library`);

    if (gone.length > 0)
        console.log(`* Plex does not have ${gone.length} matched track(s): ${gone.join(', ')}`);

    return sections;
}

async function putSectionCollection(settings: PlexConnection, target: Target, sectionId: number, collection: LibraryItem | undefined, keys: [string, ...string[]]) {
    const { id, title, thumb, records } = target;
    const others = await getSectionCollections(settings, sectionId);
    const own = collection ?? await adoptMade(settings, id, others);
    // Plex ties tracks to a collection by its title, ignoring case: two collections with one title share their tracks
    const clash = others.find(other => other.ratingKey !== own?.ratingKey && sameTitle(other.title, title));
    if (clash && records.some(item => item.plex === clash.ratingKey))
        throw new Error(`Another synced playlist already has a collection named "${clash.title}": give one of them another title to sync both as collections`);

    if (clash)
        throw new Error(`Plex already has a collection named "${clash.title}" that spotify-to-plex has no record of: rename or delete it in Plex to sync this playlist as a collection`);

    const collectionId = own?.ratingKey ?? await createCollection(settings, id, sectionId, title, keys[0]);
    if (own && own.title !== title)
        await renameCollection(settings, sectionId, collectionId, title);

    await fillCollection(settings, collectionId, keys);
    if (!thumb)
        return;

    try {
        await putPlaylistPoster(settings, collectionId, thumb);
    } catch (_e) {
        console.log(`* Could not update the collection poster`);
    }
}

// Only this playlist's collection is ever made under it, so a create whose answer or record was lost is found again
const makingTitle = (id: string) => `spotify-to-plex ${id}`;

async function adoptMade(settings: PlexConnection, id: string, others: { ratingKey: string, title: string }[]) {
    const made = others.find(other => other.title === makingTitle(id));
    if (made)
        await claim(settings, id, made.ratingKey);

    return made;
}

// Recorded before the adds, so a failed add cannot leave a collection the next sync creates again
async function claim(settings: PlexConnection, id: string, collectionId: string) {
    await addCollection({ id, plex: collectionId });
    // As the collection becomes this playlist's, not on every sync: a sort chosen later in Plex stays
    try {
        await sortCollectionByTitle(settings, collectionId);
    } catch (_e) {
        console.log(`* Could not set the collection to sort by title`);
    }
}

async function createCollection(settings: PlexConnection, id: string, sectionId: number, title: string, firstKey: string) {
    const collectionId = await storeCollection(settings, sectionId, makingTitle(id), firstKey);
    await claim(settings, id, collectionId);
    await renameCollection(settings, sectionId, collectionId, title);

    return collectionId;
}

async function fillCollection(settings: PlexConnection, collectionId: string, keys: string[]) {
    const held = new Set(await getCollectionItemKeys(settings, collectionId));
    const wanted = new Set(keys);
    const toAdd = keys.filter(key => !held.has(key));
    await addItemsToCollection(settings, collectionId, toAdd);

    // Every removal is tried, so one track Plex keeps refusing cannot hold back the rest
    const notRemoved: { key: string, error: unknown }[] = [];

    for (const key of [...held].filter(key => !wanted.has(key)))
        await removeItemFromCollection(settings, collectionId, key).catch((error: unknown) => { notRemoved.push({ key, error }) });

    await logNotAdded(settings, collectionId, toAdd);
    const [refused] = notRemoved;
    if (refused) {
        console.log(`* Plex did not take ${notRemoved.length} track(s) out of the collection: ${notRemoved.map(item => item.key).join(', ')}`);
        throw refused.error;
    }
}

async function logNotAdded(settings: PlexConnection, collectionId: string, toAdd: string[]) {
    if (toAdd.length === 0)
        return;

    const now = new Set(await getCollectionItemKeys(settings, collectionId));
    const notAdded = toAdd.filter(key => !now.has(key));
    if (notAdded.length > 0)
        console.log(`* Plex did not add ${notAdded.length} track(s) to the collection: ${notAdded.join(', ')}`);
}

// Folds widely on purpose: a false match only refuses the sync, a missed one would strip the other collection's tracks
function sameTitle(a: string, b: string) {
    const fold = (title: string) => title.normalize('NFKC').replaceAll(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    return fold(a) === fold(b);
}
