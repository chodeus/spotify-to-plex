import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearUnmapped, pruneUnmapped, readUnmappedAlbums, recordAwaitingLidarr, recordUnmapped, setUnmappedDismissed, touchAwaitingLidarr, touchUnmapped, updateUnmappedAlbums } from './unmappedAlbums';

const ID = '72PfrevnGAsfQXknMYKGVu';
const OTHER = '4aawyAB9vmqN3uQ7FjRGTy';
const deathwish = { spotify_album_id: ID, artist_name: 'Locked Years', album_name: 'Deathwish' };

describe('recordUnmapped', () => {
    it('adds an album, then counts each further failed check and keeps first_seen', () => {
        const once = recordUnmapped({}, deathwish, 100);
        expect(once[ID]).toEqual({ ...deathwish, first_seen: 100, last_checked: 100, attempts: 1, stage: 'musicbrainz' });

        const twice = recordUnmapped(once, deathwish, 200);
        expect(twice[ID]).toMatchObject({ first_seen: 100, last_checked: 200, attempts: 2 });
    });

    it('keeps a dismissal across later runs', () => {
        const dismissed = setUnmappedDismissed(recordUnmapped({}, deathwish, 100), ID, true);
        expect(recordUnmapped(dismissed, deathwish, 200)[ID]?.dismissed).toBe(true);
    });

    it('skips an album without a usable id', () => {
        expect(recordUnmapped({}, { ...deathwish, spotify_album_id: 'unknown' })).toEqual({});
        expect(recordUnmapped({}, { artist_name: 'A', album_name: 'B' })).toEqual({});
    });
});

describe('recordAwaitingLidarr', () => {
    it('moves an album to waiting on Lidarr, stamping when MusicBrainz first had it', () => {
        const unmapped = recordUnmapped({}, deathwish, 100);
        expect(unmapped[ID]?.stage).toBe('musicbrainz');

        const waiting = recordAwaitingLidarr(unmapped, deathwish, 200);
        expect(waiting[ID]).toMatchObject({ stage: 'lidarr', found_in_musicbrainz: 200, first_seen: 100, attempts: 2 });

        // A later check keeps the first time MusicBrainz had it
        expect(recordAwaitingLidarr(waiting, deathwish, 300)[ID]).toMatchObject({ found_in_musicbrainz: 200, last_checked: 300 });
    });

    it('moves back and drops the stamp should MusicBrainz lose the album', () => {
        const back = recordUnmapped(recordAwaitingLidarr({}, deathwish, 200), deathwish, 300);
        expect(back[ID]?.stage).toBe('musicbrainz');
        expect(back[ID]).not.toHaveProperty('found_in_musicbrainz');
    });

    it('touches only an album already listed', () => {
        expect(touchAwaitingLidarr({}, ID)).toEqual({});
        expect(touchAwaitingLidarr(recordUnmapped({}, deathwish, 100), ID, 200)[ID]?.stage).toBe('lidarr');
    });
});

describe('touchUnmapped', () => {
    it('counts a failed retry on a listed album only', () => {
        const list = recordUnmapped({}, deathwish, 100);
        expect(touchUnmapped(list, ID, 300)[ID]).toMatchObject({ last_checked: 300, attempts: 2 });
        expect(touchUnmapped(list, OTHER, 300)).toBe(list);
    });
});

describe('clearUnmapped', () => {
    it('drops an album once it maps', () => {
        const list = recordUnmapped(recordUnmapped({}, deathwish), { ...deathwish, spotify_album_id: OTHER });
        expect(Object.keys(clearUnmapped(list, ID))).toEqual([OTHER]);
        expect(clearUnmapped(list, undefined)).toBe(list);
    });
});

describe('setUnmappedDismissed', () => {
    it('dismisses and restores', () => {
        const list = setUnmappedDismissed(recordUnmapped({}, deathwish), ID, true);
        expect(list[ID]?.dismissed).toBe(true);
        expect(setUnmappedDismissed(list, ID, false)[ID]).not.toHaveProperty('dismissed');
    });
});

describe('pruneUnmapped', () => {
    it('keeps only albums still missing', () => {
        const list = recordUnmapped(recordUnmapped({}, deathwish), { ...deathwish, spotify_album_id: OTHER });
        expect(Object.keys(pruneUnmapped(list, [OTHER, undefined]))).toEqual([OTHER]);
        expect(pruneUnmapped(list, [])).toEqual({});
    });
});

describe('reading and writing', () => {
    let dir: string;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'unmapped-'));
    });
    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it('reads a missing or corrupt file as empty', () => {
        const path = join(dir, 'lidarr_unmapped_albums.json');
        expect(readUnmappedAlbums(path)).toEqual({});
        writeFileSync(path, '[1,2');
        expect(readUnmappedAlbums(path)).toEqual({});
        writeFileSync(path, '[]');
        expect(readUnmappedAlbums(path)).toEqual({});
    });

    it('round-trips an update', () => {
        const path = join(dir, 'lidarr_unmapped_albums.json');
        updateUnmappedAlbums(list => recordUnmapped(list, deathwish, 100), path);
        expect(readUnmappedAlbums(path)[ID]).toMatchObject({ attempts: 1 });
    });
});
