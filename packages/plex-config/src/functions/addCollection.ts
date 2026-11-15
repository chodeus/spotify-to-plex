import { getCollections } from './getCollections';
import { writeJSON } from '../utils/fileUtils';

/** Records the Plex collection made for a playlist, replacing any earlier one. */
export async function addCollection(collection: { id: string, plex: string }) {
    const { data = [] } = await getCollections();

    await writeJSON('collections.json', { data: [...data.filter(item => item.id !== collection.id), collection] });
}
