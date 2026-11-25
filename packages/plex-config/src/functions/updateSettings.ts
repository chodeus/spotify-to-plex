import { forgetPlexMatches, restorePlexMatches } from '@spotify-to-plex/shared-utils/cache/plexMatchesByServer';
import { waitForLock } from '@spotify-to-plex/shared-utils/utils/syncLock';
import { PlexSettings } from '../types/PlexSettings';
import { PlexSettingsUpdate } from '../types/PlexSettingsUpdate';
import { getSettings } from './getSettings';
import { deleteJSON, writeJSON } from '../utils/fileUtils';
import { SyncRunningError } from '../utils/SyncRunningError';

const KEY_SAVING_SYNC_RUNS = 'A playlist or album sync is running: choose the new Plex server once it finishes';

// The syncs that save Plex keys: one running now would save the old server's keys again
async function lockKeySavingSyncs() {
    const playlists = await waitForLock('playlists', 0);
    if (!playlists)
        throw new SyncRunningError(KEY_SAVING_SYNC_RUNS);

    // Released on any failure, a lock that cannot be read included: kept, it refuses playlist syncs until a restart
    try {
        const albums = await waitForLock('albums', 0);
        if (!albums)
            throw new SyncRunningError(KEY_SAVING_SYNC_RUNS);

        return () => {
            albums();
            playlists();
        };
    } catch (error) {
        playlists();
        throw error;
    }
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
        // One at a time: a failed delete leaves none still running once the locks are released
        await deleteJSON('playlists.json');
        await deleteJSON('collections.json');
        const updated = await save(current, updates);
        restoreKeptMatches(updates.id);

        return updated;
    } catch (error) {
        // The server stays as it was: its matches come back now, not left for a sync that rebuilds only the automatic ones
        restoreKeptMatches(current.id);
        throw error;
    }
}

// Long enough for another save to finish, a server switch included
const SAVE_WAIT_MS = 10_000;

const BASIS = ['id', 'uri', 'token', 'serverToken'] as const;
type Basis = Pick<PlexSettings, typeof BASIS[number]>

function sameBasis(a: Partial<Basis>, b: Partial<Basis>) {
    return BASIS.every(key => a[key] === b[key]);
}

// basedOn: the settings the updates were worked out from; another save may have changed them since
export async function updateSettings(updates: PlexSettingsUpdate, basedOn?: Basis) {
    // Every save holds this lock: one that read the settings while a switch ran would write the old server back
    const release = await waitForLock('settings', SAVE_WAIT_MS);
    if (!release)
        throw new SyncRunningError('Another settings save is still running: try again in a moment');

    try {
        const current = await getSettings(true);
        if (basedOn && !sameBasis(current, basedOn)) {
            // Another save made this same change, two syncs recovering at once say
            if (sameBasis(current, { ...basedOn, ...updates }))
                return current;

            throw new Error('Another Plex server, connection or sign-in was saved meanwhile, and it is kept');
        }

        if (!choosesAnotherServer(current, updates))
            return await save(current, updates);

        const releaseSyncs = await lockKeySavingSyncs();
        try {
            return await switchServer(current, updates);
        } finally {
            releaseSyncs();
        }
    } finally {
        release();
    }
}
