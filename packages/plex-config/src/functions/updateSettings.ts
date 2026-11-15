import { PlexSettingsUpdate } from '../types/PlexSettingsUpdate';
import { getSettings } from './getSettings';
import { deleteJSON, writeJSON } from '../utils/fileUtils';

export async function updateSettings(updates: PlexSettingsUpdate) {
    const current = await getSettings(true);
    // Saved playlist and collection keys belong to the server that made them: another server gives those numbers to its own items
    if (updates.id && current.id && updates.id !== current.id)
        await Promise.all([deleteJSON('playlists.json'), deleteJSON('collections.json')]);

    const updated = { ...current, ...updates };

    await writeJSON('plex.json', updated);

    return updated;
}