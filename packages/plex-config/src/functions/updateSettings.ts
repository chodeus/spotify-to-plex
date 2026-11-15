import { waitForLock } from '@spotify-to-plex/shared-utils/utils/syncLock';
import { PlexSettingsUpdate } from '../types/PlexSettingsUpdate';
import { getSettings } from './getSettings';
import { deleteJSON, writeJSON } from '../utils/fileUtils';
import { SyncRunningError } from '../utils/SyncRunningError';

export async function updateSettings(updates: PlexSettingsUpdate) {
    const current = await getSettings(true);
    const updated = { ...current, ...updates };
    if (!updates.id || !current.id || updates.id === current.id) {
        await writeJSON('plex.json', updated);

        return updated;
    }

    // The lock syncPlaylists runs under: a playlist sync running now would save the old server's keys again
    const release = await waitForLock('playlists', 0);
    if (!release)
        throw new SyncRunningError('A playlist sync is running: choose the new Plex server once it finishes');

    try {
        // Saved playlist and collection keys belong to the server that made them: another server gives those numbers to its own items
        await Promise.all([deleteJSON('playlists.json'), deleteJSON('collections.json')]);
        await writeJSON('plex.json', updated);
    } finally {
        release();
    }

    return updated;
}
