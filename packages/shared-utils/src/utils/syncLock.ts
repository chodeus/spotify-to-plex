import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { getStorageDir } from './getStorageDir';

/**
 * One run of each sync at a time. The web server runs a sync in its own process and the
 * scheduler starts each in a new one, so the lock is a file: in the temp directory, which
 * both share and a container restart empties, and per storage directory, since two
 * installs that keep their files apart cannot step on each other.
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
    try {
        const holder = JSON.parse(readFileSync(path, 'utf8')) as Partial<Holder>;

        return typeof holder.pid === 'number' && typeof holder.token === 'string' ? { pid: holder.pid, token: holder.token } : undefined;
    } catch {
        return undefined;
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

function isFresh(path: string) {
    try {
        return Date.now() - statSync(path).mtimeMs < MID_WRITE_MS;
    } catch {
        // Gone since the failed create: nothing left to clear
        return false;
    }
}

/** Whether a run of this sync holds its lock now. A lock left by a process that has since died does not count. */
export function isSyncRunning(name: string) {
    const holder = readHolder(lockPath(name));

    return !!holder && isAlive(holder.pid);
}

function acquire(name: string): (() => void) | undefined {
    const path = lockPath(name);
    const token = randomUUID();

    // Twice at most: the second try follows clearing a lock its dead holder left behind
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            // wx fails when the file exists, so of two runs starting together only one creates it
            writeFileSync(path, JSON.stringify({ pid: process.pid, token } satisfies Holder), { flag: 'wx' });

            return () => {
                // Only our own: a lock another run took after this one's was cleared stays
                if (readHolder(path)?.token === token)
                    rmSync(path, { force: true });
            };
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
                throw error;

            const holder = readHolder(path);
            if (holder ? isAlive(holder.pid) : isFresh(path))
                return undefined;

            rmSync(path, { force: true });
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
