import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Each sync records that it ran; users waits on `usersDone` when a test holds it
const ran: string[] = [];
let usersDone: Promise<void> = Promise.resolve();
const step = (name: string) => vi.fn(async () => { ran.push(name) });

vi.mock('../jobs/users', () => ({ syncUsers: vi.fn(async () => { await usersDone; ran.push('users') }) }));
vi.mock('../jobs/albums', () => ({ syncAlbums: step('albums') }));
vi.mock('../jobs/playlists', () => ({ syncPlaylists: step('playlists') }));
vi.mock('../jobs/lidarr', () => ({ syncLidarr: step('lidarr') }));
vi.mock('../jobs/mqtt', () => ({ syncMQTT: step('mqtt') }));
vi.mock('../jobs/slskd', () => ({ syncSlskd: step('slskd') }));

const { syncAll } = await import('../jobs/all');
const { syncAlbums } = await import('../jobs/albums');
const { isSyncRunning } = await import('@spotify-to-plex/shared-utils/utils/syncLock');

let storage: string;
let temp: string;

describe('syncAll', () => {
    beforeEach(() => {
        storage = mkdtempSync(join(tmpdir(), 'sync-all-storage-'));
        temp = mkdtempSync(join(tmpdir(), 'sync-all-temp-'));
        vi.stubEnv('STORAGE_DIR', storage);
        // The lock lives in the temp directory: a test's own keeps it from meeting a real install's
        vi.stubEnv('TMPDIR', temp);
        ran.length = 0;
        usersDone = Promise.resolve();
        vi.spyOn(console, 'log').mockImplementation(() => { /* expected */ });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
        rmSync(storage, { recursive: true, force: true });
        rmSync(temp, { recursive: true, force: true });
    });

    it('runs every sync in turn', async () => {
        await expect(syncAll()).resolves.toBe(true);

        expect(ran).toEqual(['users', 'albums', 'playlists', 'lidarr', 'mqtt', 'slskd']);
    });

    // Between steps "all" holds no single sync's lock, so only its own keeps a second run out
    it('does not start a second run while the first is going', async () => {
        let finishUsers!: () => void;
        usersDone = new Promise<void>(resolve => { finishUsers = resolve });
        const first = syncAll();

        expect(isSyncRunning('all')).toBe(true);
        await expect(syncAll()).resolves.toBeUndefined();

        finishUsers();
        await expect(first).resolves.toBe(true);
        expect(ran).toEqual(['users', 'albums', 'playlists', 'lidarr', 'mqtt', 'slskd']);
        expect(isSyncRunning('all')).toBe(false);
    });

    it('frees the lock when a step fails', async () => {
        vi.mocked(syncAlbums).mockRejectedValueOnce(new Error('Plex unreachable'));

        await expect(syncAll()).rejects.toThrow('Plex unreachable');

        expect(isSyncRunning('all')).toBe(false);
        expect(ran).toEqual(['users']);
    });
});
