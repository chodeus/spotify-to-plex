import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DAY = 24 * 60 * 60 * 1000;
const song = (id: string) => ({ id, title: `Song ${id}`, album: 'Album', album_id: 'x', artists: ['Artist'] });
// a1 misses t1 in Plex; a2 is complete
const albumTracks: Record<string, ReturnType<typeof song>[]> = { a1: [song('t1'), song('t2')], a2: [song('t3')] };
const albumData = (uri: string) => {
    const id = uri.split(':')[2] ?? '';

    return { type: 'spotify-album', id, title: id, image: '', tracks: albumTracks[id] ?? [] };
};

const { loadSpotifyData } = vi.hoisted(() => ({ loadSpotifyData: vi.fn() }));

vi.mock('@spotify-to-plex/plex-config/functions/getSettings', () => ({ getSettings: async () => ({ uri: 'http://plex.test:32400', token: 'token' }) }));
vi.mock('@spotify-to-plex/music-search/functions/getMusicSearchConfig', () => ({ getMusicSearchConfig: async () => ({ searchApproaches: [{ id: 'normal' }] }) }));
vi.mock('../utils/loadSpotifyData', () => ({ loadSpotifyData }));
vi.mock('../utils/getCachedPlexTracks', () => ({ getCachedPlexTracks: async () => ({ add: vi.fn() }) }));
vi.mock('../utils/findMissingTidalAlbums', () => ({ findMissingTidalAlbums: async () => [] }));
vi.mock('@spotify-to-plex/plex-music-search/functions/searchAlbum', () => ({
    searchAlbum: async (_config: unknown, tracks: { id: string; title: string; artists: string[]; album: string }[]) => tracks.map(track => ({
        id: track.id, title: track.title, artist: track.artists[0], album: track.album, result: track.id == 't1' ? [] : [{ id: `/library/metadata/${track.id}` }]
    }))
}));

const { syncAlbums } = await import('./albums');

let dir: string;
const read = (file: string) => readFileSync(join(dir, file), 'utf8');
const enrol = (...albums: { id: string; interval: string }[]) => {
    writeFileSync(join(dir, 'spotify_saved_items.json'), JSON.stringify(albums.map(({ id, interval }) => (
        { type: 'spotify-album', id, title: id, uri: `spotify:album:${id}`, sync: true, sync_interval: interval }
    ))));
};
const saveState = (state: object) => { writeFileSync(join(dir, 'albums_sync_state.json'), JSON.stringify(state)) };
const readState = () => JSON.parse(read('albums_sync_state.json'));
const stored = (spotify: string[], syncedAt: number) => ({ synced_at: syncedAt, missing: { spotify, tidal: [], lidarr: [], slskd: [] } });
const albumList = () => read('missing_albums_spotify.txt')
    .split('\n')
    .filter(Boolean)
    .map(line => line.split('/album/')[1]);

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'albums-job-'));
    process.env.STORAGE_DIR = dir;
    enrol({ id: 'a1', interval: '0' }, { id: 'a2', interval: '0' });
    loadSpotifyData.mockReset().mockImplementation(async (uri: string) => albumData(uri));
    vi.spyOn(console, 'log').mockImplementation(() => { /* expected */ });
});

afterEach(() => { rmSync(dir, { recursive: true, force: true }) });

describe('syncAlbums missing lists', () => {
    it('lists an album with a missing track, and records a complete one as missing nothing', async () => {
        await syncAlbums(false);

        expect(albumList()).toEqual(['a1']);
        expect(JSON.parse(read('missing_albums_slskd.json')).map((track: { spotify_id: string }) => track.spotify_id)).toEqual(['t1']);
        expect(readState().a2.missing.spotify).toEqual([]);
    });

    it('drops an album that is complete now from the lists', async () => {
        saveState({ a2: stored(['a2'], Date.now() - 2 * DAY) });

        await syncAlbums(false);

        expect(albumList()).toEqual(['a1']);
    });

    it('keeps an album that could not load on the lists, and still rewrites them', async () => {
        const a1 = stored(['a1old'], Date.now() - DAY);
        saveState({ a1 });
        loadSpotifyData.mockImplementation(async (uri: string) => uri.endsWith('a1') ? null : albumData(uri));

        await syncAlbums(false);

        expect(albumList()).toEqual(['a1old']);
        expect(readState().a1).toEqual(a1);
    });

    it('keeps the last lists when no album has synced yet', async () => {
        writeFileSync(join(dir, 'missing_albums_spotify.txt'), 'https://open.spotify.com/album/kept');
        loadSpotifyData.mockResolvedValue(null);

        await syncAlbums(false);

        expect(albumList()).toEqual(['kept']);
    });

    it('clears the state when no album is enrolled', async () => {
        enrol();
        saveState({ a1: stored(['a1'], Date.now() - DAY) });

        await syncAlbums(false);

        expect(readState()).toEqual({});
        expect(read('missing_albums_spotify.txt')).toBe('');
    });
});

describe('syncAlbums intervals', () => {
    it('skips an album synced within its interval and keeps it on the lists', async () => {
        enrol({ id: 'a1', interval: '7' }, { id: 'a2', interval: '0' });
        saveState({ a1: stored(['a1old'], Date.now() - DAY) });

        await syncAlbums(false);

        expect(loadSpotifyData.mock.calls.map(([uri]) => uri)).toEqual(['spotify:album:a2']);
        expect(albumList()).toEqual(['a1old']);
    });

    it('syncs an album whose interval has passed and records when', async () => {
        enrol({ id: 'a1', interval: '7' });
        saveState({ a1: stored(['a1old'], Date.now() - 8 * DAY) });

        await syncAlbums(false);

        expect(albumList()).toEqual(['a1']);
        expect(readState().a1.synced_at).toBeGreaterThan(Date.now() - DAY);
    });

    it('syncs every album when forced, whatever its interval', async () => {
        enrol({ id: 'a1', interval: '7' });
        saveState({ a1: stored(['a1old'], Date.now() - DAY) });

        await syncAlbums(true);

        expect(albumList()).toEqual(['a1']);
    });
});
