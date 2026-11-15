import { forgetPlexMatches } from '@spotify-to-plex/shared-utils/cache/forgetPlexMatches';
import { waitForLock } from '@spotify-to-plex/shared-utils/utils/syncLock';
import { PlexSettingsUpdate } from '../types/PlexSettingsUpdate';
import { getSettings } from './getSettings';
import { deleteJSON, writeJSON } from '../utils/fileUtils';
import { SyncRunningError } from '../utils/SyncRunningError';

// The syncs that save Plex keys: one running now would save the old server's keys again
async function lockKeySavingSyncs() {
    const playlists = await waitForLock('playlists', 0);
    const albums = playlists ? await waitForLock('albums', 0) : undefined;
    if (!playlists || !albums) {
        playlists?.();
        throw new SyncRunningError('A playlist or album sync is running: choose the new Plex server once it finishes');
    }

    return () => {
        albums();
        playlists();
    };
}

export async function updateSettings(updates: PlexSettingsUpdate) {
    const current = await getSettings(true);
    const updated = { ...current, ...updates };
    if (!updates.id || !current.id || updates.id === current.id) {
        await writeJSON('plex.json', updated);

        return updated;
    }

    const release = await lockKeySavingSyncs();
    try {
        // Saved playlist, collection, track and album keys belong to the server that made them: another server gives those numbers to its own items.
        // The track links go first, as an unreadable file is the likeliest failure: it then stops the switch before anything changed
        forgetPlexMatches();
        await Promise.all([deleteJSON('playlists.json'), deleteJSON('collections.json')]);
        await writeJSON('plex.json', updated);
    } finally {
        release();
    }

    return updated;
}
