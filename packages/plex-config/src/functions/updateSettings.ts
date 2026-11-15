import { forgetPlexMatches, restorePlexMatches } from '@spotify-to-plex/shared-utils/cache/plexMatchesByServer';
import { waitForLock } from '@spotify-to-plex/shared-utils/utils/syncLock';
import { PlexSettings } from '../types/PlexSettings';
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

// Logged, not thrown: the tracks it could not put back are left to the next sync's search
function restoreKeptMatches(server: string) {
    try {
        restorePlexMatches(server);
    } catch (error) {
        console.error(`The Plex matches kept for this server could not be put back: ${error instanceof Error ? error.message : String(error)}`);
    }
}

function choosesAnotherServer(current: PlexSettings, updates: PlexSettingsUpdate): updates is PlexSettingsUpdate & { id: string } {
    return Boolean(updates.id && current.id && updates.id !== current.id);
}

async function save(current: PlexSettings, updates: PlexSettingsUpdate) {
    const updated = { ...current, ...updates };
    await writeJSON('plex.json', updated);

    return updated;
}

async function switchServer(current: PlexSettings, updates: PlexSettingsUpdate & { id: string }) {
    // Saved playlist, collection, track and album keys belong to the server that made them: another server gives those numbers to its own items.
    // Matches leave first and come back last: a failed step never leaves a server with another server's matches
    forgetPlexMatches(current.id);
    try {
        await Promise.all([deleteJSON('playlists.json'), deleteJSON('collections.json')]);
        const updated = await save(current, updates);
        restoreKeptMatches(updates.id);

        return updated;
    } catch (error) {
        // The server stays as it was: its matches come back now, not left for a sync that rebuilds only the automatic ones
        restoreKeptMatches(current.id);
        throw error;
    }
}

export async function updateSettings(updates: PlexSettingsUpdate) {
    // A save that keeps the server takes no lock, so it never waits for a sync
    const before = await getSettings(true);
    if (!choosesAnotherServer(before, updates))
        return save(before, updates);

    const release = await lockKeySavingSyncs();
    try {
        // Read again under the locks: a switch that ended in between may have chosen this server already
        const current = await getSettings(true);

        return choosesAnotherServer(current, updates) ? await switchServer(current, updates) : await save(current, updates);
    } finally {
        release();
    }
}
