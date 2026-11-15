import { getCollections } from './getCollections';
import { writeJSON } from '../utils/fileUtils';

/** Records a Plex collection made for a playlist: one per music library its tracks are in. */
export async function addCollection(collection: { id: string, plex: string }) {
    const { data = [] } = await getCollections();
    if (data.some(item => item.id === collection.id && item.plex === collection.plex))
        return;

    await writeJSON('collections.json', { data: [...data, collection] });
}
