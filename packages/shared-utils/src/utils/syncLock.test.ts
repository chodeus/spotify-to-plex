import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isSyncRunning, runExclusive } from './syncLock';

// beforeClear: what another run does just before this one clears the lock at that path (fires once).
// touchFails: every heartbeat touch throws
const fsHooks = vi.hoisted(() => ({
    beforeClear: undefined as { path: string; act: () => void } | undefined,
    touchFails: false
}));

vi.mock('node:fs', async importOriginal => {
    const actual = await importOriginal<typeof import('node:fs')>();
    const clearing = (path: unknown) => {
        const pending = fsHooks.beforeClear;
        if (pending?.path !== path)
            return;

        fsHooks.beforeClear = undefined;
        pending.act();
    };

    return {
        ...actual,
        renameSync: (...args: Parameters<typeof actual.renameSync>) => {
            clearing(args[0]);
            actual.renameSync(...args);
        },
        rmSync: (...args: Parameters<typeof actual.rmSync>) => {
            clearing(args[0]);
            actual.rmSync(...args);
        },
        utimesSync: (...args: Parameters<typeof actual.utimesSync>) => {
            if (fsHooks.touchFails)
                throw Object.assign(new Error('EACCES: touch refused'), { code: 'EACCES' });

            actual.utimesSync(...args);
        }
    };
});

// No process has this pid: Linux caps them far lower
const DEAD_PID = 2_147_483_647;

let storage: string;
let temp: string;

// The one lock file the module made for this storage directory
function lockFile(name: string) {
    const [dir] = readdirSync(join(temp, 'spotify-to-plex-locks'));

    return join(temp, 'spotify-to-plex-locks', dir!, `${name}.lock`);
}

beforeEach(() => {
    storage = mkdtempSync(join(tmpdir(), 'sync-lock-storage-'));
    temp = mkdtempSync(join(tmpdir(), 'sync-lock-temp-'));
    process.env.STORAGE_DIR = storage;
    vi.stubEnv('TMPDIR', temp);
    vi.spyOn(console, 'log').mockImplementation(() => { /* expected */ });
});

afterEach(() => {
    fsHooks.beforeClear = undefined;
    fsHooks.touchFails = false;
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    delete process.env.STORAGE_DIR;
    rmSync(storage, { recursive: true, force: true });
    rmSync(temp, { recursive: true, force: true });
});

// A run that stays going until the test lets it finish
function heldRun() {
    let finish!: () => void;
    const done = new Promise<void>(resolve => { finish = resolve });

    return {
        run: async () => {
            await done;

            return 'first';
        },
        finish
    };
}

describe('runExclusive', () => {
    it('runs the sync and returns its result', async () => {
        await expect(runExclusive('lidarr', async () => 'done')).resolves.toBe('done');
    });

    it('does not start a second run while the first is going', async () => {
        const first = heldRun();
        const running = runExclusive('lidarr', first.run);
        const second = vi.fn(async () => 'second');

        await expect(runExclusive('lidarr', second)).resolves.toBeUndefined();
        expect(second).not.toHaveBeenCalled();

        first.finish();
        await expect(running).resolves.toBe('first');
    });

    it('lets a different sync run alongside', async () => {
        const first = heldRun();
        const running = runExclusive('lidarr', first.run);

        await expect(runExclusive('playlists', async () => 'other')).resolves.toBe('other');

        first.finish();
        await running;
    });

    it('frees the lock when the run throws', async () => {
        await expect(runExclusive('lidarr', async () => { throw new Error('boom') })).rejects.toThrow('boom');

        expect(isSyncRunning('lidarr')).toBe(false);
        await expect(runExclusive('lidarr', async () => 'again')).resolves.toBe('again');
    });

    it('takes over a lock its holder died without releasing', async () => {
        await runExclusive('lidarr', async () => { /* a run that ends at once */ });
        writeFileSync(lockFile('lidarr'), JSON.stringify({ pid: DEAD_PID, token: 'gone' }));

        expect(isSyncRunning('lidarr')).toBe(false);
        await expect(runExclusive('lidarr', async () => 'took over')).resolves.toBe('took over');
    });

    // A restarted container gives the same pids out again, so the old holder's pid can be alive
    it('takes over a lock whose holder stopped refreshing it, though its pid is alive', async () => {
        await runExclusive('lidarr', async () => { /* a run that ends at once */ });
        writeFileSync(lockFile('lidarr'), JSON.stringify({ pid: process.pid, token: 'before the restart' }));
        const stale = new Date(Date.now() - 6 * 60_000);
        utimesSync(lockFile('lidarr'), stale, stale);

        expect(isSyncRunning('lidarr')).toBe(false);
        await expect(runExclusive('lidarr', async () => 'took over')).resolves.toBe('took over');
    });

    // Two runs judge the same lock stale: the one clearing it second must not delete the lock the first just took
    it('leaves a lock another run took after this one judged the old one stale', async () => {
        await runExclusive('lidarr', async () => { /* a run that ends at once */ });
        const path = lockFile('lidarr');
        writeFileSync(path, JSON.stringify({ pid: DEAD_PID, token: 'gone' }));
        fsHooks.beforeClear = {
            path,
            act: () => {
                rmSync(path);
                writeFileSync(path, JSON.stringify({ pid: process.pid, token: 'other run' }), { flag: 'wx' });
            }
        };
        const run = vi.fn(async () => 'second');

        await expect(runExclusive('lidarr', run)).resolves.toBeUndefined();
        expect(run).not.toHaveBeenCalled();
        expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ token: 'other run' });
        expect(readdirSync(dirname(path))).toEqual(['lidarr.lock']);
    });

    // Root reads any file, so it cannot meet an unreadable lock
    it.skipIf(process.getuid?.() === 0)('stops on a lock it cannot read rather than taking it over', async () => {
        await runExclusive('lidarr', async () => { /* a run that ends at once */ });
        const path = lockFile('lidarr');
        writeFileSync(path, JSON.stringify({ pid: process.pid, token: 'unreadable' }));
        // Past the half-written wait: the holder cannot read it either, so its heartbeat stopped
        const minutesAgo = new Date(Date.now() - 2 * 60_000);
        utimesSync(path, minutesAgo, minutesAgo);
        chmodSync(path, 0o000);
        const run = vi.fn(async () => 'took over');

        await expect(runExclusive('lidarr', run)).rejects.toThrow(/EACCES/);
        expect(() => isSyncRunning('lidarr')).toThrow(/EACCES/);
        expect(run).not.toHaveBeenCalled();
    });

    it('keeps a long run holding its lock', async () => {
        vi.useFakeTimers();
        const first = heldRun();
        const running = runExclusive('lidarr', first.run);

        await vi.advanceTimersByTimeAsync(20 * 60_000);
        expect(isSyncRunning('lidarr')).toBe(true);
        await expect(runExclusive('lidarr', async () => 'second')).resolves.toBeUndefined();

        first.finish();
        await running;
    });

    it('keeps a run going when its heartbeat cannot touch the lock', async () => {
        vi.useFakeTimers();
        const first = heldRun();
        const running = runExclusive('lidarr', first.run);
        fsHooks.touchFails = true;

        await vi.advanceTimersByTimeAsync(2 * 60_000);

        first.finish();
        await expect(running).resolves.toBe('first');
    });

    it('waits on a lock still being written, but not on one left half-written long ago', async () => {
        await runExclusive('lidarr', async () => { /* a run that ends at once */ });
        const path = lockFile('lidarr');
        writeFileSync(path, '');

        await expect(runExclusive('lidarr', async () => 'too soon')).resolves.toBeUndefined();

        const longAgo = new Date(Date.now() - 5 * 60_000);
        utimesSync(path, longAgo, longAgo);
        await expect(runExclusive('lidarr', async () => 'cleared')).resolves.toBe('cleared');
    });

    it('keeps installs with separate storage apart', async () => {
        const first = heldRun();
        const running = runExclusive('lidarr', first.run);

        const otherStorage = mkdtempSync(join(tmpdir(), 'sync-lock-other-'));
        process.env.STORAGE_DIR = otherStorage;
        await expect(runExclusive('lidarr', async () => 'other install')).resolves.toBe('other install');

        process.env.STORAGE_DIR = storage;
        first.finish();
        await running;
        rmSync(otherStorage, { recursive: true, force: true });
    });
});

describe('isSyncRunning', () => {
    it('is true only while a run holds the lock', async () => {
        expect(isSyncRunning('lidarr')).toBe(false);

        const first = heldRun();
        const running = runExclusive('lidarr', first.run);
        expect(isSyncRunning('lidarr')).toBe(true);

        first.finish();
        await running;
        expect(isSyncRunning('lidarr')).toBe(false);
    });
});
