import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Plex is the only thing faked: the lists, the state, the cache and the lock are the real ones
vi.mock('@spotify-to-plex/plex-config/functions/getSettings', () => ({ getSettings: async () => ({ uri: 'http://plex.test:32400', token: 'token' }) }));
vi.mock('../utils/getPlexPlaylists', () => ({ getPlexPlaylists: async () => ({ playlists: [] }) }));

const { runExclusive } = await import('@spotify-to-plex/shared-utils/utils/syncLock');
const { setManualTrackLink } = await import('@spotify-to-plex/shared-utils/cache/setManualTrackLink');
const { missingListsFor } = await import('../utils/missingLists');
const { forgetHandMatchedTracks } = await import('./forgetHandMatchedTracks');
const { syncPlaylists } = await import('./playlists');

const DAY = 24 * 60 * 60 * 1000;
let dir: string;

const read = (file: string) => readFileSync(join(dir, file), 'utf8');
const write = (file: string, data: unknown) => writeFileSync(join(dir, file), JSON.stringify(data));
const state = (file: string) => JSON.parse(read(file));
const slskdIds = (file = 'missing_tracks_slskd.json') => JSON.parse(read(file)).map((item: { spotify_id: string }) => item.spotify_id);
const lidarr = (file = 'missing_tracks_lidarr.json') => JSON.parse(read(file)).map((item: { artist_name: string; album_name: string }) => `${item.artist_name}|${item.album_name}`);
const song = (id: string, album: string, artist = 'Artist') => ({ id, title: `Song ${id}`, album, album_id: `al-${album}`, artists: [artist], album_artist: artist });

// Each playlist's lists as the playlists job stores them
async function storePlaylists(playlists: Record<string, ReturnType<typeof song>[]>, syncedAt = Date.now()) {
    const entries = await Promise.all(Object.entries(playlists).map(async ([id, tracks]) => [id, { synced_at: syncedAt, missing: await missingListsFor(tracks) }]));
    write('playlists_sync_state.json', Object.fromEntries(entries));
}

async function storeAlbum(id: string, tracks: ReturnType<typeof song>[]) {
    const missing = await missingListsFor(tracks);
    write('albums_sync_state.json', { [id]: { synced_at: 1, missing: { ...missing, spotify: [id] } } });
}

// What the route does on a hand match
function match(id: string) {
    setManualTrackLink(id, `/library/metadata/${id}`);
    forgetHandMatchedTracks();
}

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hand-matched-'));
    vi.stubEnv('STORAGE_DIR', dir);
    vi.stubEnv('TIDAL_API_CLIENT_ID', '');
    vi.stubEnv('TIDAL_API_CLIENT_SECRET', '');
    vi.spyOn(console, 'log').mockImplementation(() => { /* expected */ });
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
});

describe('forgetHandMatchedTracks', () => {
    it('takes the track off every playlist that lists it, and its album only where no other track needs it', async () => {
        await storePlaylists({ p1: [song('t1', 'A'), song('t2', 'A')], p2: [song('t1', 'A'), song('t3', 'B')], p3: [song('t9', 'C')] });

        match('t1');

        const { p1, p2, p3 } = state('playlists_sync_state.json');
        expect(p1.missing.slskd.map((item: { spotify_id: string }) => item.spotify_id)).toEqual(['t2']);
        // One entry per missing track until the files merge them
        expect(p1.missing.lidarr.map((item: { album_name: string }) => item.album_name)).toEqual(['A', 'A']);
        expect(p2.missing.spotify).toEqual(['t3']);
        expect(p2.missing.lidarr.map((item: { album_name: string }) => item.album_name)).toEqual(['B']);
        expect(p3.missing.spotify).toEqual(['t9']);
        expect(slskdIds()).toEqual(['t2', 't3', 't9']);
        expect(lidarr()).toEqual(['Artist|A', 'Artist|B', 'Artist|C']);
        expect(read('missing_tracks_spotify.txt')).not.toContain('t1');
    });

    it('takes off every copy of a song a playlist holds twice', async () => {
        await storePlaylists({ p1: [song('t1', 'A'), song('t2', 'B'), song('t1', 'A')] });

        match('t1');

        expect(slskdIds()).toEqual(['t2']);
        expect(lidarr()).toEqual(['Artist|B']);
    });

    it('tells two albums of one name apart', async () => {
        await storePlaylists({ p1: [song('t1', 'Greatest Hits', 'Queen'), { ...song('t2', 'Greatest Hits', 'ABBA'), album_id: 'al-abba' }] });

        match('t1');

        expect(lidarr()).toEqual(['ABBA|Greatest Hits']);
    });

    // A scraped track without a bare id carries its uri as its id
    it('takes off a track whose id is a spotify:track: uri', async () => {
        await storePlaylists({ p1: [song('spotify:track:t1', 'A'), song('t2', 'B')] });

        match('spotify:track:t1');

        expect(slskdIds()).toEqual(['t2']);
    });

    // Without the id it cannot tell which album entry the track needed, so none is dropped
    it('keeps the albums of a list written before tracks carried their album id', async () => {
        await storePlaylists({ p1: [song('t1', 'A')] });
        const stored = state('playlists_sync_state.json');
        delete stored.p1.missing.slskd[0].spotify_album_id;
        write('playlists_sync_state.json', stored);

        match('t1');

        expect(slskdIds()).toEqual([]);
        expect(lidarr()).toEqual(['Artist|A']);
    });

    it('keeps an album on the album lists while another of its tracks is missing, and drops it after', async () => {
        await storeAlbum('a1', [song('t1', 'A'), song('t2', 'A')]);

        match('t1');
        expect(slskdIds('missing_albums_slskd.json')).toEqual(['t2']);
        expect(read('missing_albums_spotify.txt')).toBe('https://open.spotify.com/album/a1');

        match('t2');
        expect(read('missing_albums_spotify.txt')).toBe('');
        expect(lidarr('missing_albums_lidarr.json')).toEqual([]);
    });

    // Only a person's pick: an automatic match is not the user saying the track is in Plex
    it('leaves a track with an automatic match on the lists', async () => {
        await storePlaylists({ p1: [song('t1', 'A')] });
        write('track_links.json', [{ spotify_id: 't1', plex_id: ['/library/metadata/1'] }]);

        forgetHandMatchedTracks();

        expect(state('playlists_sync_state.json').p1.missing.spotify).toEqual(['t1']);
    });

    it('leaves the lists as they are for a track none of them holds', async () => {
        await storePlaylists({ p1: [song('t1', 'A')] });
        const before = read('playlists_sync_state.json');

        match('t7');

        expect(read('playlists_sync_state.json')).toBe(before);
        expect(slskdIds()).toEqual(['t1']);
    });

    // The state is saved before the lists: a list write that failed must not stay wrong
    it('repairs the lists a failed write left behind', async () => {
        await storePlaylists({ p1: [song('t1', 'A'), song('t2', 'B')] });
        mkdirSync(join(dir, 'missing_tracks_lidarr.json'));
        vi.spyOn(console, 'error').mockImplementation(() => { /* expected */ });

        match('t1');
        rmSync(join(dir, 'missing_tracks_lidarr.json'), { recursive: true });
        forgetHandMatchedTracks();

        expect(slskdIds()).toEqual(['t2']);
        expect(lidarr()).toEqual(['Artist|B']);
    });

    it('survives a list write that fails after waiting for a sync', async () => {
        await storePlaylists({ p1: [song('t1', 'A')] });
        vi.spyOn(console, 'error').mockImplementation(() => { /* expected */ });
        vi.useFakeTimers();
        let finish!: () => void;
        const running = runExclusive('playlists', () => new Promise<void>(resolve => { finish = resolve }));
        match('t1');
        mkdirSync(join(dir, 'missing_tracks_lidarr.json'));

        finish();
        await running;

        await expect(vi.advanceTimersByTimeAsync(15_000)).resolves.not.toThrow();
    });

    it('still cleans the album lists when the playlist lists cannot be written', async () => {
        await storePlaylists({ p1: [song('t1', 'A')] });
        await storeAlbum('a1', [song('t1', 'A'), song('t2', 'A')]);
        mkdirSync(join(dir, 'missing_tracks_lidarr.json'));
        vi.spyOn(console, 'error').mockImplementation(() => { /* expected */ });

        match('t1');

        expect(slskdIds('missing_albums_slskd.json')).toEqual(['t2']);
    });

    // setManualTrackLink matches ids exactly, so a uri-form pick adds a second entry beside the bare one
    it('takes off the Tidal link of a track cached under its bare id and its uri', async () => {
        await storePlaylists({ p1: [song('t1', 'A'), song('t2', 'B')] });
        const stored = state('playlists_sync_state.json');
        stored.p1.missing.tidal = ['T', 'T2'];
        write('playlists_sync_state.json', stored);
        write('track_links.json', [{ spotify_id: 't1', tidal_id: ['T'] }, { spotify_id: 't2', tidal_id: ['T2'] }]);

        match('spotify:track:t1');

        expect(read('missing_tracks_tidal.txt')).toBe('https://tidal.com/browse/track/T2');
    });

    // The same recording can sit in a playlist as a single and as an album track
    it('keeps a Tidal link another listed track still needs', async () => {
        await storePlaylists({ p1: [song('t1', 'A'), song('t2', 'B'), song('t3', 'C')] });
        const stored = state('playlists_sync_state.json');
        stored.p1.missing.tidal = ['T', 'T3'];
        write('playlists_sync_state.json', stored);
        write('track_links.json', [{ spotify_id: 't1', tidal_id: ['T'] }, { spotify_id: 't2', tidal_id: ['T'] }, { spotify_id: 't3', tidal_id: ['T3'] }]);

        match('t1');
        expect(read('missing_tracks_tidal.txt')).toBe('https://tidal.com/browse/track/T\nhttps://tidal.com/browse/track/T3');

        match('t2');
        expect(read('missing_tracks_tidal.txt')).toBe('https://tidal.com/browse/track/T3');
    });

    // The running sync would write its own lists over an edit made now, and may have read the matches already
    it('waits for a running sync to end, then takes the track off', async () => {
        await storePlaylists({ p1: [song('t1', 'A'), song('t2', 'B')] });
        const before = read('playlists_sync_state.json');
        vi.useFakeTimers();
        let finish!: () => void;
        const running = runExclusive('playlists', () => new Promise<void>(resolve => { finish = resolve }));

        match('t1');
        expect(read('playlists_sync_state.json')).toBe(before);

        finish();
        await running;
        await vi.advanceTimersByTimeAsync(15_000);

        expect(slskdIds()).toEqual(['t2']);
        vi.useRealTimers();
    });

    // The playlist is not due for a week: the next run must take the track off all the same
    it('takes off a track matched during a sync at the next run, though its playlist is not due', async () => {
        write('spotify_saved_items.json', [{ type: 'spotify-playlist', id: 'p1', title: 'p1', uri: 'spotify:playlist:p1', sync: true, sync_interval: '7' }]);
        await storePlaylists({ p1: [song('t1', 'A'), song('t2', 'B')] }, Date.now() - DAY);
        // The held lock makes the match schedule a retry: faked, so it never runs after this test's storage is gone
        vi.useFakeTimers({ toFake: ['setTimeout'] });
        let finish!: () => void;
        const running = runExclusive('playlists', () => new Promise<void>(resolve => { finish = resolve }));
        match('t1');
        finish();
        await running;

        await syncPlaylists(false);

        expect(slskdIds()).toEqual(['t2']);
    });
});
