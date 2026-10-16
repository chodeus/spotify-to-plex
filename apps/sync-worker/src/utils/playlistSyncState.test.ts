import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { notDueUntil, readPlaylistSyncState, savePlaylistSyncState } from './playlistSyncState';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 16, 2);
const missing = { spotify: ['a'], tidal: [], lidarr: [], slskd: [] };
const syncedAgo = (ms: number) => ({ synced_at: NOW - ms, missing });

let dir: string;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'playlist-sync-state-'));
    process.env.STORAGE_DIR = dir;
});

afterEach(() => { rmSync(dir, { recursive: true, force: true }) });

describe('notDueUntil', () => {
    it('makes a playlist that never synced due', () => {
        expect(notDueUntil(undefined, 7, NOW)).toBeUndefined();
    });

    it('makes a playlist with no interval due on every run', () => {
        expect(notDueUntil(syncedAgo(60 * 1000), 0, NOW)).toBeUndefined();
    });

    it('holds a weekly playlist back until its seventh night', () => {
        expect(notDueUntil(syncedAgo(6 * DAY), 7, NOW)).toEqual(new Date(NOW + DAY));
        expect(notDueUntil(syncedAgo(7 * DAY - 5 * 60 * 1000), 7, NOW)).toBeUndefined();
    });

    it('counts a nightly run a few minutes early as a day later', () => {
        expect(notDueUntil(syncedAgo(DAY - 5 * 60 * 1000), 1, NOW)).toBeUndefined();
    });

    it('allows half a day early and no more', () => {
        expect(notDueUntil(syncedAgo(DAY / 2 + 60 * 1000), 1, NOW)).toBeUndefined();
        expect(notDueUntil(syncedAgo(DAY / 2 - 60 * 1000), 1, NOW)).toBeInstanceOf(Date);
    });

    it('makes a playlist stamped in the future due', () => {
        expect(notDueUntil(syncedAgo(-DAY), 7, NOW)).toBeUndefined();
    });
});

describe('readPlaylistSyncState', () => {
    it('is empty before the first sync', () => {
        expect(readPlaylistSyncState()).toEqual({});
    });

    it('reads back what was saved', () => {
        savePlaylistSyncState({ p1: syncedAgo(0) });

        expect(readPlaylistSyncState()).toEqual({ p1: syncedAgo(0) });
    });

    it('drops an entry it cannot use and keeps the rest', () => {
        writeFileSync(join(dir, 'playlists_sync_state.json'), JSON.stringify({
            good: syncedAgo(0),
            noStamp: { missing },
            noList: { synced_at: NOW, missing: { spotify: [], tidal: [], lidarr: [] } },
            notAnObject: 5
        }));

        expect(readPlaylistSyncState()).toEqual({ good: syncedAgo(0) });
    });

    it('treats a file it cannot parse as no state, so every playlist is due', () => {
        vi.spyOn(console, 'error').mockImplementation(() => { /* expected */ });
        writeFileSync(join(dir, 'playlists_sync_state.json'), '{"p1": ');

        expect(readPlaylistSyncState()).toEqual({});
    });

    it('treats a file holding null as no state', () => {
        vi.spyOn(console, 'error').mockImplementation(() => { /* expected */ });
        writeFileSync(join(dir, 'playlists_sync_state.json'), 'null');

        expect(readPlaylistSyncState()).toEqual({});
    });
});
