import { linkSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeFileAtomic } from './writeFileAtomic';

describe('writeFileAtomic', () => {
    let dir: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'atomic-text-'));
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it('replaces the file with the text as given', () => {
        const path = join(dir, 'list.txt');
        writeFileSync(path, 'old');
        linkSync(path, join(dir, 'old-inode'));

        writeFileAtomic(path, 'a\nb');

        expect(readFileSync(join(dir, 'old-inode'), 'utf8')).toBe('old');
        expect(readFileSync(path, 'utf8')).toBe('a\nb');
        expect(readdirSync(dir).sort()).toEqual(['list.txt', 'old-inode']);
    });
});
