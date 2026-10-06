import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readMissingSlskdTracks } from './readMissingSlskdTracks';

const track = (id: string, album = 'Album') => ({ spotify_id: id, artist_name: 'Artist', track_name: `Track ${id}`, album_name: album });

describe('readMissingSlskdTracks', () => {
    let dir: string;
    const write = (file: string, content: unknown) => writeFileSync(join(dir, file), typeof content == 'string' ? content : JSON.stringify(content));

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'slskd-queue-'));
        process.env.STORAGE_DIR = dir;
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
        delete process.env.STORAGE_DIR;
    });

    it('queues the playlists job and the albums job together', () => {
        write('missing_tracks_slskd.json', [track('p1')]);
        write('missing_albums_slskd.json', [track('a1')]);

        expect(readMissingSlskdTracks().map(item => item.spotify_id)).toEqual(['p1', 'a1']);
    });

    it('lists a track both jobs miss once', () => {
        write('missing_tracks_slskd.json', [track('t1', 'Playlist copy')]);
        write('missing_albums_slskd.json', [track('t1', 'Album copy')]);

        expect(readMissingSlskdTracks()).toHaveLength(1);
    });

    it('reads one file when the other job has not written yet', () => {
        write('missing_tracks_slskd.json', [track('p1')]);

        expect(readMissingSlskdTracks().map(item => item.spotify_id)).toEqual(['p1']);
    });

    it('is empty when neither job has written', () => {
        expect(readMissingSlskdTracks()).toEqual([]);
    });

    it('fails on a file that does not parse', () => {
        write('missing_albums_slskd.json', '[{"spotify_id": "a1"');

        expect(() => readMissingSlskdTracks()).toThrow('Failed to parse missing_albums_slskd.json');
    });
});
