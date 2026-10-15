import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tracks = [
    { id: 'gone', title: 'Gone', album: 'Album', album_id: 'al1', artists: ['Artist'] },
    { id: 'unasked', title: 'Unasked', album: 'Other', album_id: 'al2', artists: ['Artist'] }
];

vi.mock('@spotify-to-plex/plex-config/functions/getSettings', () => ({ getSettings: async () => ({ uri: 'http://plex.test:32400', token: 'token' }) }));
vi.mock('@spotify-to-plex/music-search/functions/getMusicSearchConfig', () => ({ getMusicSearchConfig: async () => ({ searchApproaches: [{ id: 'normal' }] }) }));
vi.mock('../utils/getPlexPlaylists', () => ({ getPlexPlaylists: async () => ({ playlists: [] }) }));
vi.mock('../utils/loadSpotifyData', () => ({ loadSpotifyData: async () => ({ title: 'Playlist', image: '', tracks }) }));
vi.mock('../utils/getCachedPlexTracks', () => ({ getCachedPlexTracks: async () => ({ result: [], add: vi.fn(), markChecked: vi.fn(), recheck: [] }) }));
vi.mock('../utils/matchByIsrc', () => ({ matchByIsrc: async (_config: unknown, results: unknown) => results }));
vi.mock('../utils/putPlexTracks', () => ({ putPlexPlaylist: vi.fn() }));
vi.mock('../utils/findMissingTidalTracks', () => ({ findMissingTidalTracks: async () => [] }));
// "Gone" is not in Plex; Plex answered no query for "Unasked"
vi.mock('@spotify-to-plex/plex-music-search/functions/search', () => ({
    search: async () => [
        { id: 'gone', artist: 'Artist', title: 'Gone', album: 'Album', result: [] },
        { id: 'unasked', artist: 'Artist', title: 'Unasked', album: 'Other', result: [], failed: true }
    ]
}));

const { syncPlaylists } = await import('./playlists');

let dir: string;
const read = (file: string) => readFileSync(join(dir, file), 'utf8');

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'playlists-job-'));
    process.env.STORAGE_DIR = dir;
    writeFileSync(join(dir, 'spotify_saved_items.json'), JSON.stringify([{ type: 'spotify-playlist', id: 'p1', title: 'Playlist', uri: 'spotify:playlist:p1', sync: true, sync_interval: '0' }]));
    vi.spyOn(console, 'log').mockImplementation(() => { /* expected */ });
});

afterEach(() => { rmSync(dir, { recursive: true, force: true }) });

describe('syncPlaylists missing lists', () => {
    it('still rewrites the lists when Plex could not search one track', async () => {
        await syncPlaylists();

        expect(existsSync(join(dir, 'missing_tracks_spotify.txt'))).toBe(true);
        expect(read('missing_tracks_spotify.txt')).toBe('https://open.spotify.com/track/gone');
        expect(JSON.parse(read('missing_tracks_lidarr.json'))).toEqual([{ artist_name: 'Artist', album_name: 'Album', spotify_album_id: 'al1' }]);
    });

    it('keeps an unsearched track in the lists when the last run had it missing', async () => {
        writeFileSync(join(dir, 'missing_tracks_spotify.txt'), 'https://open.spotify.com/track/unasked\nhttps://open.spotify.com/track/fixed');

        await syncPlaylists();

        expect(read('missing_tracks_spotify.txt').split('\n')).toEqual(['https://open.spotify.com/track/gone', 'https://open.spotify.com/track/unasked']);
        expect(JSON.parse(read('missing_tracks_slskd.json')).map((track: { spotify_id: string }) => track.spotify_id)).toEqual(['gone', 'unasked']);
    });
});
