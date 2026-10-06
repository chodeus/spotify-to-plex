import { linkSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeJsonFileAtomic } from './writeJsonFileAtomic';

describe('writeJsonFileAtomic', () => {
    let dir: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'atomic-write-'));
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    // A hard link keeps the old inode, so it only changes if the write went into the file in place
    it('replaces the file instead of writing into it', () => {
        const path = join(dir, 'state.json');
        writeFileSync(path, '["old"]');
        linkSync(path, join(dir, 'old-inode'));

        writeJsonFileAtomic(path, ['new']);

        expect(readFileSync(join(dir, 'old-inode'), 'utf8')).toBe('["old"]');
        expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(['new']);
        expect(readdirSync(dir).sort()).toEqual(['old-inode', 'state.json']);
    });

    it('keeps the indentation asked for', () => {
        const path = join(dir, 'state.json');

        writeJsonFileAtomic(path, { a: 1 }, 2);

        expect(readFileSync(path, 'utf8')).toBe('{\n  "a": 1\n}');
    });
});
