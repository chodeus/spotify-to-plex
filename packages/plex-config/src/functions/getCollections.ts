import { PlexCollections } from '../types/PlexCollections';
import { readJSON } from '../utils/fileUtils';

/** The Plex collections made for each synced playlist, by Spotify id: one per music library it has had tracks in. */
export async function getCollections() {
    return await readJSON<PlexCollections>('collections.json') ?? { data: [] };
}
