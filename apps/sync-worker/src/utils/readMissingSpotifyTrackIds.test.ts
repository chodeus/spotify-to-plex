import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readMissingSpotifyTrackIds } from './readMissingSpotifyTrackIds';

let dir: string;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'missing-spotify-'));
    process.env.STORAGE_DIR = dir;
});

afterEach(() => { rmSync(dir, { recursive: true, force: true }) });

describe('readMissingSpotifyTrackIds', () => {
    it('reads the ids from the track links the playlists job writes', () => {
        writeFileSync(join(dir, 'missing_tracks_spotify.txt'), 'https://open.spotify.com/track/a1\nhttps://open.spotify.com/track/b2');

        expect([...readMissingSpotifyTrackIds()]).toEqual(['a1', 'b2']);
    });

    it('skips blank and foreign lines', () => {
        writeFileSync(join(dir, 'missing_tracks_spotify.txt'), '\nnot a link\nhttps://open.spotify.com/track/a1\n');

        expect([...readMissingSpotifyTrackIds()]).toEqual(['a1']);
    });

    it('is empty before the first list is written', () => {
        expect(readMissingSpotifyTrackIds().size).toBe(0);
    });
});
