import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runExclusive } from '@spotify-to-plex/shared-utils/utils/syncLock';
import { forgetMissingTrack } from './forgetMissingTrack';

let dir: string;

const read = (file: string) => readFileSync(join(dir, file), 'utf8');
const write = (file: string, data: unknown) => writeFileSync(join(dir, file), JSON.stringify(data));
const track = (id: string, album: string) => ({ spotify_id: id, artist_name: 'Artist', track_name: `Song ${id}`, album_name: album });
const album = (name: string) => ({ artist_name: 'Artist', album_name: name, spotify_album_id: `id-${name}` });
const entry = (missing: object) => ({ synced_at: 1000, missing: { spotify: [], tidal: [], lidarr: [], slskd: [], ...missing } });
const state = (file: string) => JSON.parse(read(file));

// t1 is listed by two playlists and by album a1, where it is the only missing track
function storeLists() {
    write('playlists_sync_state.json', {
        p1: entry({ spotify: ['t1', 't2'], tidal: ['tid1', 'tid2'], lidarr: [album('A')], slskd: [track('t1', 'A'), track('t2', 'A')] }),
        p2: entry({ spotify: ['t1', 't3'], tidal: ['tid1'], lidarr: [album('A'), album('B')], slskd: [track('t1', 'A'), track('t3', 'B')] }),
        p3: entry({ spotify: ['t9'], lidarr: [album('C')], slskd: [track('t9', 'C')] })
    });
    write('albums_sync_state.json', {
        a1: entry({ spotify: ['a1'], tidal: ['tidal-a1'], lidarr: [album('A')], slskd: [track('t1', 'A')] }),
        a2: entry({ spotify: ['a2'], lidarr: [album('D')], slskd: [track('t4', 'D'), track('t5', 'D')] })
    });
    write('track_links.json', [{ spotify_id: 't1', tidal_id: ['tid1'] }]);
}

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'forget-missing-'));
    vi.stubEnv('STORAGE_DIR', dir);
    vi.spyOn(console, 'log').mockImplementation(() => { /* expected */ });
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
});

describe('forgetMissingTrack', () => {
    it('takes the track off every playlist that lists it, and its album only where no other track needs it', async () => {
        storeLists();

        await forgetMissingTrack('t1');

        const { p1, p2, p3 } = state('playlists_sync_state.json');
        expect(p1.missing).toEqual({ spotify: ['t2'], tidal: ['tid2'], lidarr: [album('A')], slskd: [track('t2', 'A')] });
        expect(p2.missing).toEqual({ spotify: ['t3'], tidal: [], lidarr: [album('B')], slskd: [track('t3', 'B')] });
        expect(p3).toEqual(entry({ spotify: ['t9'], lidarr: [album('C')], slskd: [track('t9', 'C')] }));
    });

    it('rewrites the missing files from the lists the playlists still hold', async () => {
        storeLists();

        await forgetMissingTrack('t1');

        expect(JSON.parse(read('missing_tracks_slskd.json')).map((item: { spotify_id: string }) => item.spotify_id)).toEqual(['t2', 't3', 't9']);
        expect(JSON.parse(read('missing_tracks_lidarr.json')).map((item: { album_name: string }) => item.album_name)).toEqual(['A', 'B', 'C']);
        expect(read('missing_tracks_spotify.txt')).not.toContain('t1');
        expect(read('missing_tracks_tidal.txt')).not.toContain('tid1');
    });

    it('drops an album from the album lists once none of its tracks is missing', async () => {
        storeLists();

        await forgetMissingTrack('t1');
        await forgetMissingTrack('t4');

        const { a1, a2 } = state('albums_sync_state.json');
        expect(a1.missing).toEqual({ spotify: [], tidal: [], lidarr: [], slskd: [] });
        expect(a2.missing.lidarr).toEqual([album('D')]);
        expect(a2.missing.slskd).toEqual([track('t5', 'D')]);
        expect(read('missing_albums_spotify.txt')).toBe('https://open.spotify.com/album/a2');
    });

    it('writes nothing for a track no list holds', async () => {
        storeLists();
        const before = read('playlists_sync_state.json');

        await forgetMissingTrack('t7');

        expect(read('playlists_sync_state.json')).toBe(before);
        expect(existsSync(join(dir, 'missing_tracks_slskd.json'))).toBe(false);
    });

    // The running sync rewrites its lists when it ends, so an edit now would be lost
    it('leaves the lists of a sync that is running alone', async () => {
        storeLists();
        const before = read('playlists_sync_state.json');
        let finish!: () => void;
        const running = runExclusive('playlists', () => new Promise<void>(resolve => { finish = resolve }));

        await forgetMissingTrack('t1');

        expect(read('playlists_sync_state.json')).toBe(before);
        expect(state('albums_sync_state.json').a1.missing.slskd).toEqual([]);
        finish();
        await running;
    });
});
