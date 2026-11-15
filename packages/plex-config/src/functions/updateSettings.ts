import { forgetPlexMatches, restorePlexMatches } from '@spotify-to-plex/shared-utils/cache/plexMatchesByServer';
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

// The switch is saved by now: a failed restore leaves those tracks to the next sync's search
function restoreKeptMatches(server: string) {
    try {
        restorePlexMatches(server);
    } catch (error) {
        console.error(`The Plex matches kept for this server could not be put back: ${error instanceof Error ? error.message : String(error)}`);
    }
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
        // Matches leave first and come back last: a failed step never leaves a server with another server's matches
        forgetPlexMatches(current.id);
        await Promise.all([deleteJSON('playlists.json'), deleteJSON('collections.json')]);
        await writeJSON('plex.json', updated);
        restoreKeptMatches(updates.id);
    } finally {
        release();
    }

    return updated;
}
