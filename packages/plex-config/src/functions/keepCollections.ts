import { getCollections } from './getCollections';
import { writeJSON } from '../utils/fileUtils';

/** Drops the playlist's records of every collection but those named. */
export async function keepCollections(id: string, plex: string[]) {
    const { data = [] } = await getCollections();

    await writeJSON('collections.json', { data: data.filter(item => item.id !== id || plex.includes(item.plex)) });
}
