import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearSyncState, notDueUntil, openSyncState, readSyncState } from './syncState';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 16, 2);
const FILE = 'test_sync_state.json';
const lists = (spotify: string[]) => ({ spotify, tidal: [], lidarr: [], slskd: [] });
const missing = lists(['a']);
const syncedAgo = (ms: number) => ({ synced_at: NOW - ms, missing });

let dir: string;
const writeState = (state: unknown) => { writeFileSync(join(dir, FILE), typeof state === 'string' ? state : JSON.stringify(state)) };
const fileState = () => JSON.parse(readFileSync(join(dir, FILE), 'utf8'));

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sync-state-'));
    process.env.STORAGE_DIR = dir;
});

afterEach(() => { rmSync(dir, { recursive: true, force: true }) });

describe('notDueUntil', () => {
    it('makes an item that never synced due', () => {
        expect(notDueUntil(undefined, 7, NOW)).toBeUndefined();
    });

    it('makes an item with no interval due on every run', () => {
        expect(notDueUntil(syncedAgo(60 * 1000), 0, NOW)).toBeUndefined();
    });

    it('holds a weekly item back until its seventh night', () => {
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

    it('makes an item stamped in the future due', () => {
        expect(notDueUntil(syncedAgo(-DAY), 7, NOW)).toBeUndefined();
    });
});

describe('readSyncState', () => {
    it('is empty before the first sync', () => {
        expect(readSyncState(FILE)).toEqual({});
    });

    it('drops an entry it cannot use and keeps the rest', () => {
        writeState({
            good: syncedAgo(0),
            noStamp: { missing },
            noList: { synced_at: NOW, missing: { spotify: [], tidal: [], lidarr: [] } },
            notAnObject: 5
        });

        expect(readSyncState(FILE)).toEqual({ good: syncedAgo(0) });
    });

    it('treats a file it cannot parse as no state, so every item is due', () => {
        vi.spyOn(console, 'error').mockImplementation(() => { /* expected */ });
        writeState('{"p1": ');

        expect(readSyncState(FILE)).toEqual({});
    });

    it('treats a file holding null as no state', () => {
        vi.spyOn(console, 'error').mockImplementation(() => { /* expected */ });
        writeState('null');

        expect(readSyncState(FILE)).toEqual({});
    });
});

describe('openSyncState', () => {
    it('keeps what this run synced, else the stored sync, for each enrolled item', () => {
        writeState({ kept: syncedAgo(DAY), resynced: syncedAgo(DAY) });
        const syncState = openSyncState(FILE);
        syncState.record('resynced', lists(['new']));

        expect(syncState.settle([{ id: 'kept' }, { id: 'resynced' }])).toEqual(lists(['a', 'new']));
        expect(fileState().kept).toEqual(syncedAgo(DAY));
        expect(fileState().resynced.missing).toEqual(lists(['new']));
        expect(fileState().resynced.synced_at).toBeGreaterThan(NOW);
    });

    it('drops an item no longer enrolled', () => {
        writeState({ removed: syncedAgo(DAY) });
        const syncState = openSyncState(FILE);
        syncState.record('enrolled', lists(['b']));

        expect(syncState.settle([{ id: 'enrolled' }])).toEqual(lists(['b']));
        expect(Object.keys(fileState())).toEqual(['enrolled']);
    });

    it('writes nothing and returns no lists until an enrolled item has synced', () => {
        writeState({ removed: syncedAgo(DAY) });

        expect(openSyncState(FILE).settle([{ id: 'never' }])).toBeUndefined();
        expect(Object.keys(fileState())).toEqual(['removed']);
    });

    it('answers whether a stored item is due', () => {
        writeState({ weekly: { synced_at: Date.now() - DAY, missing } });

        expect(openSyncState(FILE).notDueUntil('weekly', 7)).toBeInstanceOf(Date);
        expect(openSyncState(FILE).notDueUntil('unknown', 7)).toBeUndefined();
    });
});

describe('clearSyncState', () => {
    it('leaves no stored sync', () => {
        writeState({ p1: syncedAgo(DAY) });

        clearSyncState(FILE);

        expect(fileState()).toEqual({});
        expect(existsSync(join(dir, FILE))).toBe(true);
    });
});
