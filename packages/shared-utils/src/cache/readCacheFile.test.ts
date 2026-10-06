import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readCacheFile } from './readCacheFile';

describe('readCacheFile', () => {
    let dir: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'cache-file-'));
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it('reads the entries', () => {
        writeFileSync(join(dir, 'cache.json'), '[{"id":1}]');

        expect(readCacheFile(join(dir, 'cache.json'))).toEqual([{ id: 1 }]);
    });

    it('starts empty when the file is missing', () => {
        expect(readCacheFile(join(dir, 'cache.json'))).toEqual([]);
    });

    it('starts empty when the file holds something other than a list', () => {
        writeFileSync(join(dir, 'cache.json'), 'null');

        expect(readCacheFile(join(dir, 'cache.json'))).toEqual([]);
    });

    it('starts empty when the file is torn', () => {
        writeFileSync(join(dir, 'cache.json'), '[{"id":');

        expect(readCacheFile(join(dir, 'cache.json'))).toEqual([]);
    });
});
