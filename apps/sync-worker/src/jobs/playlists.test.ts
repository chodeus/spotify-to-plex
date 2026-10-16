import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DAY = 24 * 60 * 60 * 1000;
const tracks = [
    { id: 'gone', title: 'Gone', album: 'Album', album_id: 'al1', artists: ['Artist'] },
    { id: 'unasked', title: 'Unasked', album: 'Other', album_id: 'al2', artists: ['Artist'] }
];
const playlistTracks: Record<string, typeof tracks> = {
    'spotify:playlist:p1': tracks,
    'spotify:playlist:p2': [{ id: 'fresh', title: 'Fresh', album: 'New', album_id: 'al3', artists: ['Artist'] }]
};
const spotifyData = (uri: string) => ({ title: 'Playlist', image: '', tracks: playlistTracks[uri] ?? [] });

const { loadSpotifyData } = vi.hoisted(() => ({ loadSpotifyData: vi.fn() }));

vi.mock('@spotify-to-plex/plex-config/functions/getSettings', () => ({ getSettings: async () => ({ uri: 'http://plex.test:32400', token: 'token' }) }));
vi.mock('@spotify-to-plex/music-search/functions/getMusicSearchConfig', () => ({ getMusicSearchConfig: async () => ({ searchApproaches: [{ id: 'normal' }] }) }));
vi.mock('../utils/getPlexPlaylists', () => ({ getPlexPlaylists: async () => ({ playlists: [] }) }));
vi.mock('../utils/loadSpotifyData', () => ({ loadSpotifyData }));
vi.mock('../utils/getCachedPlexTracks', () => ({ getCachedPlexTracks: async () => ({ result: [], add: vi.fn(), markChecked: vi.fn(), recheck: [] }) }));
vi.mock('../utils/matchByIsrc', () => ({ matchByIsrc: async (_config: unknown, results: unknown) => results }));
vi.mock('../utils/putPlexTracks', () => ({ putPlexPlaylist: vi.fn() }));
vi.mock('../utils/findMissingTidalTracks', () => ({ findMissingTidalTracks: async () => [] }));
// Plex has none of the tracks, and answered no query for "Unasked"
vi.mock('@spotify-to-plex/plex-music-search/functions/search', () => ({
    search: async (_config: unknown, items: { id: string; title: string; album: string }[]) => items.map(item => ({
        id: item.id, artist: 'Artist', title: item.title, album: item.album, result: [], ...(item.id == 'unasked' ? { failed: true } : {})
    }))
}));

const { syncPlaylists } = await import('./playlists');

let dir: string;
const read = (file: string) => readFileSync(join(dir, file), 'utf8');
const enrol = (...playlists: { id: string; interval: string }[]) => {
    writeFileSync(join(dir, 'spotify_saved_items.json'), JSON.stringify(playlists.map(({ id, interval }) => (
        { type: 'spotify-playlist', id, title: id, uri: `spotify:playlist:${id}`, sync: true, sync_interval: interval }
    ))));
};
const saveState = (state: object) => { writeFileSync(join(dir, 'playlists_sync_state.json'), JSON.stringify(state)) };
const readState = () => JSON.parse(read('playlists_sync_state.json'));
const stored = (spotify: string[], syncedAt: number) => ({ synced_at: syncedAt, missing: { spotify, tidal: [], lidarr: [], slskd: [] } });
const spotifyList = () => read('missing_tracks_spotify.txt')
    .split('\n')
    .map(line => line.split('/track/')[1]);

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'playlists-job-'));
    process.env.STORAGE_DIR = dir;
    enrol({ id: 'p1', interval: '0' });
    loadSpotifyData.mockReset().mockImplementation(async (uri: string) => spotifyData(uri));
    vi.spyOn(console, 'log').mockImplementation(() => { /* expected */ });
});

afterEach(() => { rmSync(dir, { recursive: true, force: true }) });

describe('syncPlaylists missing lists', () => {
    it('still rewrites the lists when Plex could not search one track', async () => {
        await syncPlaylists(false);

        expect(existsSync(join(dir, 'missing_tracks_spotify.txt'))).toBe(true);
        expect(read('missing_tracks_spotify.txt')).toBe('https://open.spotify.com/track/gone');
        expect(JSON.parse(read('missing_tracks_lidarr.json'))).toEqual([{ artist_name: 'Artist', album_name: 'Album', spotify_album_id: 'al1' }]);
    });

    it('keeps an unsearched track in the lists when the last run had it missing', async () => {
        writeFileSync(join(dir, 'missing_tracks_spotify.txt'), 'https://open.spotify.com/track/unasked\nhttps://open.spotify.com/track/fixed');

        await syncPlaylists(false);

        expect(read('missing_tracks_spotify.txt').split('\n')).toEqual(['https://open.spotify.com/track/gone', 'https://open.spotify.com/track/unasked']);
        expect(JSON.parse(read('missing_tracks_slskd.json')).map((track: { spotify_id: string }) => track.spotify_id)).toEqual(['gone', 'unasked']);
    });

    it('keeps the missing tracks of a playlist that could not load, and still rewrites the lists', async () => {
        const p2 = stored(['old'], Date.now() - DAY);
        enrol({ id: 'p1', interval: '0' }, { id: 'p2', interval: '0' });
        saveState({ p2 });
        loadSpotifyData.mockImplementation(async (uri: string) => uri.endsWith('p2') ? null : spotifyData(uri));

        await syncPlaylists(false);

        expect(spotifyList()).toEqual(['gone', 'old']);
        expect(readState().p2).toEqual(p2);
    });

    it('keeps the last lists when no playlist has synced yet', async () => {
        writeFileSync(join(dir, 'missing_tracks_spotify.txt'), 'https://open.spotify.com/track/kept');
        loadSpotifyData.mockResolvedValue(null);

        await syncPlaylists(false);

        expect(spotifyList()).toEqual(['kept']);
    });

    it('drops a playlist no longer enrolled from the lists and the state', async () => {
        saveState({ removed: stored(['stale'], Date.now() - DAY) });

        await syncPlaylists(false);

        expect(spotifyList()).toEqual(['gone']);
        expect(Object.keys(readState())).toEqual(['p1']);
    });

    it('clears the state when no playlist is enrolled', async () => {
        enrol();
        saveState({ p1: stored(['old'], Date.now() - DAY) });

        await syncPlaylists(false);

        expect(readState()).toEqual({});
        expect(read('missing_tracks_spotify.txt')).toBe('');
    });
});

describe('syncPlaylists intervals', () => {
    it('skips a playlist synced within its interval and keeps its missing tracks in the lists', async () => {
        enrol({ id: 'p1', interval: '0' }, { id: 'p2', interval: '7' });
        saveState({ p2: stored(['old'], Date.now() - DAY) });

        await syncPlaylists(false);

        expect(loadSpotifyData.mock.calls.map(([uri]) => uri)).toEqual(['spotify:playlist:p1']);
        expect(spotifyList()).toEqual(['gone', 'old']);
    });

    it('syncs a playlist whose interval has passed and records when', async () => {
        enrol({ id: 'p1', interval: '0' }, { id: 'p2', interval: '7' });
        saveState({ p2: stored(['old'], Date.now() - 8 * DAY) });

        await syncPlaylists(false);

        expect(spotifyList()).toEqual(['gone', 'fresh']);
        expect(readState().p2.synced_at).toBeGreaterThan(Date.now() - DAY);
    });

    it('syncs every playlist when forced, whatever its interval', async () => {
        enrol({ id: 'p2', interval: '7' });
        saveState({ p2: stored(['old'], Date.now() - DAY) });

        await syncPlaylists(true);

        expect(spotifyList()).toEqual(['fresh']);
    });
});
