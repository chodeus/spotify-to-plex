import { createHash, randomUUID } from 'node:crypto';
import { linkSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { getStorageDir } from './getStorageDir';

/**
 * One run of each sync at a time: a lock file in the temp directory the web server and the scheduler
 * share, per storage directory so separate installs never meet. It outlives a container restart.
 */
function lockPath(name: string) {
    const storage = createHash('sha256')
        .update(resolve(getStorageDir()))
        .digest('hex')
        .slice(0, 12);
    const dir = join(tmpdir(), 'spotify-to-plex-locks', storage);
    mkdirSync(dir, { recursive: true });

    return join(dir, `${name}.lock`);
}

type Holder = { pid: number; token: string };

function readHolder(path: string): Holder | undefined {
    let text: string;
    try {
        text = readFileSync(path, 'utf8');
    } catch (error) {
        // Only a lock that is gone has no holder: any other read failure leaves a live one unproven
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            return undefined;

        throw error;
    }

    try {
        const holder = JSON.parse(text) as Partial<Holder>;

        return typeof holder.pid === 'number' && typeof holder.token === 'string' ? { pid: holder.pid, token: holder.token } : undefined;
    } catch {
        // Half-written: its age decides, see MID_WRITE_MS
        return undefined;
    }
}

// A lock it cannot read is not the token's, so the caller leaves it alone
function hasToken(path: string, token: string | undefined) {
    try {
        return readHolder(path)?.token === token;
    } catch {
        return false;
    }
}

function isAlive(pid: number) {
    try {
        process.kill(pid, 0);

        return true;
    } catch (error) {
        // EPERM: the process exists, it is just not ours to signal
        return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
}

// An unreadable lock this young is a holder still writing it; an older one, a holder that died doing so
const MID_WRITE_MS = 60_000;

// A holder touches its lock this often. A restarted container hands the same pids out again, so a
// live pid alone does not prove the holder lives: a lock untouched for STALE_MS was left behind
const HEARTBEAT_MS = 30_000;
const STALE_MS = 5 * 60_000;

function ageMs(path: string) {
    try {
        return Date.now() - statSync(path).mtimeMs;
    } catch {
        return Number.POSITIVE_INFINITY;
    }
}

function isHeld(path: string, holder: Holder | undefined) {
    return !!holder && isAlive(holder.pid) && ageMs(path) < STALE_MS;
}

function isFresh(path: string) {
    // Gone since the failed create reads as infinitely old: nothing left to clear
    return ageMs(path) < MID_WRITE_MS;
}

/** Whether a run of this sync holds its lock now. A lock left by a process that has since died does not count. */
export function isSyncRunning(name: string) {
    const path = lockPath(name);

    return isHeld(path, readHolder(path));
}

// Moved aside before it is deleted: a lock another run took after this one judged it stale goes back
function clearStale(path: string, judged: Holder | undefined) {
    const aside = `${path}.${randomUUID()}`;
    try {
        renameSync(path, aside);
    } catch (error) {
        // Another run cleared it first
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            return;

        throw error;
    }

    try {
        if (!hasToken(aside, judged?.token))
            linkSync(aside, path);
    } catch (error) {
        // EEXIST: yet another run took the lock meanwhile, and holds it now
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
            throw error;
    } finally {
        rmSync(aside, { force: true });
    }
}

function acquire(name: string): (() => void) | undefined {
    const path = lockPath(name);
    const token = randomUUID();

    // Twice at most: the second try follows clearing a lock its dead holder left behind
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            // wx fails when the file exists, so of two runs starting together only one creates it
            writeFileSync(path, JSON.stringify({ pid: process.pid, token } satisfies Holder), { flag: 'wx' });
            const ours = () => hasToken(path, token);
            const heartbeat = setInterval(() => {
                // A throw in a timer would end the process: a touch that fails just leaves the lock to age
                try {
                    if (ours())
                        utimesSync(path, new Date(), new Date());
                } catch { /* gone or unwritable */ }
            }, HEARTBEAT_MS);
            heartbeat.unref();

            return () => {
                clearInterval(heartbeat);
                // Only our own: a lock another run took after this one's was cleared stays
                if (ours())
                    rmSync(path, { force: true });
            };
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
                throw error;

            const holder = readHolder(path);
            if (holder ? isHeld(path, holder) : isFresh(path))
                return undefined;

            clearStale(path, holder);
        }
    }

    return undefined;
}

/**
 * Runs the sync unless a run of it is already going; that one is left to finish and this
 * returns undefined without starting. The lock is released however the run ends.
 */
export async function runExclusive<T>(name: string, run: () => Promise<T>): Promise<T | undefined> {
    const release = acquire(name);
    if (!release) {
        console.log(`The ${name} sync is already running; not starting another`);

        return undefined;
    }

    try {
        return await run();
    } finally {
        release();
    }
}
