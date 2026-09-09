import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SavedItem } from '@spotify-to-plex/shared-types/spotify/SavedItem';
import { savedItemsHelpers } from './savedItemsHelpers';

let dir: string;
let file: string;

const item = (uri: string): SavedItem => ({
    type: 'spotify-playlist', uri, id: uri.split(':').pop() ?? uri, title: uri, image: ''
});

const write = (items: SavedItem[]) => { writeFileSync(file, JSON.stringify(items, undefined, 4)) };
const read = (): SavedItem[] => JSON.parse(readFileSync(file, 'utf8'));

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'saved-items-'));
    process.env.STORAGE_DIR = dir;
    file = join(dir, 'spotify_saved_items.json');
});

afterEach(() => { rmSync(dir, { recursive: true, force: true }) });

describe('savedItemsHelpers', () => {

    it('appends a new item', () => {
        write([item('spotify:playlist:kept')]);

        const helpers = savedItemsHelpers();
        helpers.add(item('spotify:playlist:fresh'));
        helpers.save();

        expect(read().map(i => i.uri)).toEqual(['spotify:playlist:kept', 'spotify:playlist:fresh']);
    });

    // The job holds the list as it was when it started. A sync run is long
    // enough for someone to delete an item in the UI meanwhile, and writing the
    // snapshot back whole used to resurrect it.
    it('does not resurrect an item deleted while the job was running', () => {
        write([item('spotify:playlist:kept'), item('spotify:playlist:doomed')]);

        const helpers = savedItemsHelpers();          // snapshot taken here, holds both
        write([item('spotify:playlist:kept')]);       // someone deletes one in the UI
        helpers.add(item('spotify:playlist:fresh'));
        helpers.save();

        expect(read().map(i => i.uri)).toEqual(['spotify:playlist:kept', 'spotify:playlist:fresh']);
    });

    it('leaves the file untouched when nothing was added', () => {
        write([item('spotify:playlist:kept')]);
        const before = statSync(file).mtimeMs;

        const helpers = savedItemsHelpers();
        helpers.add(item('spotify:playlist:kept'));   // already present, so not an addition
        helpers.save();

        expect(statSync(file).mtimeMs).toBe(before);
        expect(read()).toHaveLength(1);
    });

    it('does not duplicate an item another writer added first', () => {
        write([item('spotify:playlist:kept')]);

        const helpers = savedItemsHelpers();
        helpers.add(item('spotify:playlist:fresh'));
        write([item('spotify:playlist:kept'), item('spotify:playlist:fresh')]);
        helpers.save();

        expect(read().map(i => i.uri)).toEqual(['spotify:playlist:kept', 'spotify:playlist:fresh']);
    });
});
