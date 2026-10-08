import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runScript } from './runScript';

const WORKER_DIR = resolve(import.meta.dirname, '../..');

function exitCodeOf(child: ReturnType<typeof runScript>) {
    return new Promise<number | null>(done => { child.on('exit', done) });
}

describe('runScript', () => {
    let dir: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'run-script-'));
        mkdirSync(join(dir, 'node_modules', '.bin'), { recursive: true });
        const tool = join(dir, 'node_modules', '.bin', 'local-tool');
        writeFileSync(tool, '#!/bin/sh\ntouch "$1"\n');
        chmodSync(tool, 0o755);
        writeFileSync(join(dir, 'package.json'), JSON.stringify({
            scripts: {
                'uses-bin': 'local-tool ran.txt',
                'stops-on-failure': 'false && touch second.txt'
            }
        }));
    });

    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    // npm run puts the package's own binaries on PATH; tsx is found the same way in the image
    it('finds the package\'s own binaries', async () => {
        expect(await exitCodeOf(runScript('uses-bin', dir))).toBe(0);
        expect(existsSync(join(dir, 'ran.txt'))).toBe(true);
    });

    it('stops a chained script at the first failure and reports it', async () => {
        expect(await exitCodeOf(runScript('stops-on-failure', dir))).not.toBe(0);
        expect(existsSync(join(dir, 'second.txt'))).toBe(false);
    });

    it('refuses a script the package does not define', () => {
        expect(() => runScript('missing', dir)).toThrow('No "missing" script');
    });

    it('covers every script the scheduler runs', () => {
        const scheduler = readFileSync(join(WORKER_DIR, 'src', 'scheduler.ts'), 'utf8');
        const names = [...scheduler.matchAll(/runScript\('([^']+)'\)/g)].map(match => match[1]);
        const { scripts } = JSON.parse(readFileSync(join(WORKER_DIR, 'package.json'), 'utf8')) as { scripts: Record<string, string> };

        expect(names).toEqual(['sync', 'sync:lidarr', 'sync:slskd', 'mqtt']);
        expect(names.filter(name => !scripts[name])).toEqual([]);
    });
});
