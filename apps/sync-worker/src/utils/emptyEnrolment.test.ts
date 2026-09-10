import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSavedAlbums } from './getSavedAlbums';
import { getSavedPlaylists } from './getSavedPlaylists';
import { hasNothingEnrolled } from './hasNothingEnrolled';
import { startSyncType } from './startSyncType';

let dir: string;

const write = (items: unknown[]) => {
    writeFileSync(join(dir, 'spotify_saved_items.json'), JSON.stringify(items, undefined, 4));
};

const syncStatus = (type: string) => {
    const log = JSON.parse(readFileSync(join(dir, 'sync_type_log.json'), 'utf8'));

    return log[type]?.status;
};

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'empty-enrolment-'));
    process.env.STORAGE_DIR = dir;
});

afterEach(() => { rmSync(dir, { recursive: true, force: true }) });

// These used to throw "Found no playlists to sync", which marked the nightly
// sync red for a state that just means there is nothing to do.
describe('nothing enrolled', () => {

    it('returns an empty list rather than throwing when no album is enrolled', () => {
        write([{ type: 'spotify-playlist', id: 'p1', sync: true }]);

        expect(getSavedAlbums().toSyncAlbums).toEqual([]);
    });

    it('returns an empty list rather than throwing when no playlist is enrolled', () => {
        write([{ type: 'spotify-album', id: 'a1', sync: true }]);

        expect(getSavedPlaylists().toSyncPlaylists).toEqual([]);
    });

    it('ignores items that are saved but not enrolled for syncing', () => {
        write([
            { type: 'spotify-playlist', id: 'p1', sync: false },
            { type: 'spotify-album', id: 'a1' }
        ]);

        expect(getSavedPlaylists().toSyncPlaylists).toEqual([]);
        expect(getSavedAlbums().toSyncAlbums).toEqual([]);
    });

    it('returns an empty list when the saved-items file does not exist yet', () => {
        expect(getSavedAlbums().toSyncAlbums).toEqual([]);
        expect(getSavedPlaylists().toSyncPlaylists).toEqual([]);
    });

    it('still returns what is enrolled', () => {
        write([
            { type: 'spotify-playlist', id: 'p1', sync: true },
            { type: 'spotify-album', id: 'a1', sync: true }
        ]);

        expect(getSavedPlaylists().toSyncPlaylists).toHaveLength(1);
        expect(getSavedAlbums().toSyncAlbums).toHaveLength(1);
    });
});

describe('hasNothingEnrolled', () => {

    // Mirrors the jobs: startSyncType runs first, and completeSyncType only
    // updates an entry that already exists
    it('marks the sync complete and reports true for an empty list', () => {
        startSyncType('albums');
        expect(syncStatus('albums')).toBe('running');

        expect(hasNothingEnrolled([], 'albums', 'albums')).toBe(true);
        expect(syncStatus('albums')).toBe('success');
    });

    it('reports false and leaves the sync running when there is work', () => {
        startSyncType('playlists');

        expect(hasNothingEnrolled(['something'], 'playlists', 'playlists')).toBe(false);
        expect(syncStatus('playlists')).toBe('running');
    });
});
