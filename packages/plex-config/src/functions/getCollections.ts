import { PlexCollections } from '../types/PlexCollections';
import { readJSON } from '../utils/fileUtils';

/** The Plex collection made for each synced playlist, by Spotify id. */
export async function getCollections() {
    return await readJSON<PlexCollections>('collections.json') ?? { data: [] };
}
