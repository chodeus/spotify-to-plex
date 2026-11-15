import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { updateSettings } from '@spotify-to-plex/plex-config/functions/updateSettings';

import { membersOf, plex, resetPlex, tag, untag } from './testing/fakePlexLibrary';

const { plexTv, spotify } = vi.hoisted(() => ({
    plexTv: { get: vi.fn(), post: vi.fn() },
    spotify: { tracks: [] as { id: string, plex?: number }[], image: '', realCache: false },
}));

vi.mock('@spotify-to-plex/http-client/plexTvClient', () => ({ plexTvClient: plexTv }));
vi.mock('@spotify-to-plex/http-client/AxiosRequest', async () => {
    const { fakeAxiosRequest } = await import('./testing/fakePlexLibrary');

    return { AxiosRequest: fakeAxiosRequest };
});
const { loadSpotifyData } = vi.hoisted(() => ({ loadSpotifyData: vi.fn() }));
vi.mock('./loadSpotifyData', () => ({ loadSpotifyData }));
// The real cache, reading track_links.json, when a test sets spotify.realCache
vi.mock('./getCachedPlexTracks', async importOriginal => {
    const real = await importOriginal<typeof import('./getCachedPlexTracks')>();

    return { getCachedPlexTracks: async (...args: Parameters<typeof real.getCachedPlexTracks>) => {
        if (spotify.realCache)
            return real.getCachedPlexTracks(...args);

        const result = spotify.tracks.map(track => ({ id: track.id, title: track.id, artist: 'A', album: 'B', result: track.plex === undefined ? [] : [{ id: `/library/metadata/${track.plex}` }] }));

        return { result, add: vi.fn(), markChecked: vi.fn(), recheck: [], standIns: new Map<string, string>() };
    } };
});
vi.mock('./findMissingTidalTracks', () => ({ findMissingTidalTracks: async () => [] }));
vi.mock('@/helpers/errors/generateError', async () => import('../../../web/src/helpers/errors/generateError'));

let dir: string;
const write = (name: string, data: unknown) => { writeFileSync(join(dir, name), JSON.stringify(data)) };
const read = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
const saved = (extra: Record<string, unknown> = {}) => write('spotify_saved_items.json', [{ type: 'spotify-playlist', id: 'p1', title: 'Mix', uri: 'spotify:playlist:p1', image: '', sync: true, sync_interval: '0', ...extra }]);
const errorOf = (id: string) => read('sync_log.json').playlists.find((log: { id: string }) => log.id === id)?.error;
const collectionsNamed = (title: string) => [...plex.collections].filter(([, c]) => c.title.toLowerCase() === title.toLowerCase()).map(([ratingKey]) => ratingKey);
const tracks = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `t${i + 1}`, plex: i + 1 }));
const keys = (...ns: number[]) => ns.map(String);

async function sync(force = true) {
    const { syncPlaylists } = await import('../jobs/playlists');
    await syncPlaylists(force);
}

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'plex-collections-'));
    process.env.STORAGE_DIR = dir;
    resetPlex();
    spotify.realCache = false;
    write('plex.json', { id: 'machine', uri: 'http://plex.test:32400', token: 'owner-account', serverToken: 'owner-server' });
    saved({ plex_target: 'collection' });
    spotify.tracks = tracks(3);
    spotify.image = 'http://img.test/cover.jpg';
    loadSpotifyData.mockReset().mockImplementation(async () => ({ title: 'Mix', image: spotify.image, tracks: spotify.tracks.map(track => ({ id: track.id, title: track.id, album: 'B', album_id: 'b', artists: ['A'] })) }));
    vi.spyOn(console, 'log').mockImplementation(() => { /* expected */ });
    vi.spyOn(console, 'error').mockImplementation(() => { /* expected */ });
});
afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
});

describe('playlist sync into a Plex collection', () => {
    it('makes one collection holding the matched tracks, and no playlist', async () => {
        spotify.tracks = [{ id: 't1', plex: 1 }, { id: 't2', plex: 2 }, { id: 't3' }];

        await sync();

        expect(collectionsNamed('Mix')).toEqual(['900']);
        expect(membersOf('900')).toEqual(keys(1, 2));
        expect(plex.playlists.size).toBe(0);
        expect(read('collections.json').data).toEqual([{ id: 'p1', plex: '900' }]);
        expect(plex.sorts.get('900')).toBe('1');
        expect(errorOf('p1')).toBeUndefined();
    });

    it('fills a 250-track playlist in requests Plex accepts', async () => {
        spotify.tracks = tracks(250);

        await sync();

        expect(errorOf('p1')).toBeUndefined();
        expect(membersOf('900')).toHaveLength(250);
    });

    it('on the next sync adds new tracks and takes out dropped ones, in the same collection', async () => {
        await sync();
        spotify.tracks = [{ id: 't2', plex: 2 }, { id: 't3', plex: 3 }, { id: 't4', plex: 4 }];

        await sync();

        expect(collectionsNamed('Mix')).toEqual(['900']);
        expect(membersOf('900')).toEqual(keys(2, 3, 4));
        expect(plex.requests.filter(line => line.startsWith('PUT /library/metadata/900/prefs'))).toHaveLength(1);
    });

    it('takes out every other dropped track when Plex refuses to take out one, and names that one', async () => {
        await sync();
        spotify.tracks = tracks(1);
        plex.fail = (method, path) => method === 'DELETE' && path.endsWith('/children/2');

        await sync();

        expect(errorOf('p1')).toBe('Something went wrong while syncing: Request failed with status code 401');
        expect(membersOf('900')).toEqual(keys(1, 2));
        expect(console.log).toHaveBeenCalledWith('* Plex did not take 1 track(s) out of the collection: /library/metadata/2');
    });

    it('renames the collection with the playlist, keeping its tracks', async () => {
        await sync();
        saved({ plex_target: 'collection', title: 'Mix 2' });

        await sync();

        expect([...plex.collections]).toEqual([['900', { title: 'Mix 2', section: 6 }]]);
        expect(membersOf('900')).toEqual(keys(1, 2, 3));
    });

    it.each([undefined, '', '  '])('names the playlist and collection after the Spotify playlist when the saved title is %j', async title => {
        saved({ plex_target: 'both', title });

        await sync();

        expect(errorOf('p1')).toBeUndefined();
        expect([...plex.collections.values()]).toEqual([{ title: 'Mix', section: 6 }]);
        expect([...plex.playlistTitles.values()]).toEqual(['Mix']);
    });

    it('as both, makes the playlist and the collection', async () => {
        saved({ plex_target: 'both' });

        await sync();

        expect([...plex.playlists.values()]).toEqual([['/library/metadata/1', '/library/metadata/2', '/library/metadata/3']]);
        expect(membersOf(collectionsNamed('Mix')[0] ?? '')).toEqual(keys(1, 2, 3));
    });

    it('leaves a collection it did not make alone when its title is taken, ignoring case, and still syncs the rest', async () => {
        plex.collections.set('800', { title: 'MIX', section: 6 });
        tag('7', 'MIX');
        saved({ plex_target: 'both' });

        await sync();

        expect([...plex.collections.keys()]).toEqual(['800']);
        expect(membersOf('800')).toEqual(keys(7));
        expect([...plex.playlists.values()]).toEqual([['/library/metadata/1', '/library/metadata/2', '/library/metadata/3']]);
        expect(errorOf('p1')).toBe('Something went wrong while syncing: Plex already has a collection named "MIX" that spotify-to-plex has no record of: rename or delete it in Plex to sync this playlist as a collection');
    });

    it('names the other synced playlist when it already has a collection with this title', async () => {
        const item = (id: string) => ({ type: 'spotify-playlist', id, title: 'Discover Weekly', uri: `spotify:playlist:${id}`, image: '', sync: true, sync_interval: '0', plex_target: 'collection' });
        write('spotify_saved_items.json', [item('p1'), item('p2')]);

        await sync();

        expect(collectionsNamed('Discover Weekly')).toEqual(['900']);
        expect(errorOf('p1')).toBeUndefined();
        expect(errorOf('p2')).toBe('Something went wrong while syncing: Another synced playlist already has a collection named "Discover Weekly": give one of them another title to sync both as collections');
    });

    it('keeps its collection as it was rather than rename it to a title another collection has', async () => {
        await sync();
        plex.collections.set('800', { title: 'Other', section: 6 });
        tag('7', 'Other');
        saved({ plex_target: 'collection', title: 'other' });

        await sync();

        expect(plex.collections.get('900')?.title).toBe('Mix');
        expect(membersOf('900')).toEqual(keys(1, 2, 3));
        expect(membersOf('800')).toEqual(keys(7));
        expect(errorOf('p1')).toContain('Plex already has a collection named "Other"');
    });

    it('makes a new collection when the recorded one was deleted in Plex', async () => {
        await sync();

        for (const n of membersOf('900'))
            untag(n, 'Mix');
        plex.collections.delete('900');

        await sync();

        expect(collectionsNamed('Mix')).toEqual(['901']);
        expect(membersOf('901')).toEqual(keys(1, 2, 3));
        expect(read('collections.json').data).toEqual([{ id: 'p1', plex: '901' }]);
    });

    it('resumes into the collection it made when a sync stopped part-way through the adds', async () => {
        spotify.tracks = tracks(150);
        plex.fail = (method, path) => method === 'PUT' && path.endsWith('/items');
        await sync();
        expect(errorOf('p1')).toBe('Something went wrong while syncing: Request failed with status code 401');

        plex.fail = undefined;
        await sync();

        expect(errorOf('p1')).toBeUndefined();
        expect(collectionsNamed('Mix')).toEqual(['900']);
        expect(membersOf('900')).toHaveLength(150);
    });

    it('takes over the collection a create made when Plex lost its answer, rather than make a second', async () => {
        plex.loseAnswer = (method, path) => method === 'POST' && path === '/library/collections';
        await sync();
        expect(errorOf('p1')).toBe('Something went wrong while syncing: timeout of 30000ms exceeded');
        expect([...plex.collections]).toEqual([['900', { title: 'spotify-to-plex p1', section: 6 }]]);

        plex.loseAnswer = undefined;
        await sync();

        expect(errorOf('p1')).toBeUndefined();
        expect([...plex.collections]).toEqual([['900', { title: 'Mix', section: 6 }]]);
        expect(membersOf('900')).toEqual(keys(1, 2, 3));
        expect(plex.sorts.get('900')).toBe('1');
        expect(read('collections.json').data).toEqual([{ id: 'p1', plex: '900' }]);
    });

    it("leaves a new server's playlist and collection alone when they carry the keys saved for the old server", async () => {
        saved({ plex_target: 'both' });
        write('playlists.json', { data: [{ id: 'p1', plex: '700' }] });
        write('collections.json', { data: [{ id: 'p1', plex: '800' }] });
        plex.playlists.set('700', ['/library/metadata/7']);
        plex.collections.set('800', { title: 'Road Trip', section: 6 });
        tag('7', 'Road Trip');

        await updateSettings({ id: 'other-machine', uri: 'http://other.test:32400', serverToken: 'other-server' });
        await sync();

        expect(plex.playlists.get('700')).toEqual(['/library/metadata/7']);
        expect([...plex.playlists.values()]).toContainEqual(['/library/metadata/1', '/library/metadata/2', '/library/metadata/3']);
        expect(plex.collections.get('800')?.title).toBe('Road Trip');
        expect(membersOf('800')).toEqual(keys(7));
        expect(membersOf(collectionsNamed('Mix')[0] ?? '')).toEqual(keys(1, 2, 3));
    });

    it('refuses a server switch while a playlist sync runs, and keeps what that sync saved', async () => {
        const load = loadSpotifyData.getMockImplementation();
        let refused: unknown;
        loadSpotifyData.mockImplementationOnce(async (...args: unknown[]) => {
            refused = await updateSettings({ id: 'other-machine', uri: 'http://other.test:32400', serverToken: 'other-server' })
                .then(() => 'switched', (error: unknown) => error instanceof Error ? error.message : error);

            return load?.(...args);
        });

        await sync();

        expect(refused).toBe('A playlist sync is running: choose the new Plex server once it finishes');
        expect(read('plex.json').id).toBe('machine');
        expect(errorOf('p1')).toBeUndefined();
        expect(read('collections.json').data).toEqual([{ id: 'p1', plex: '900' }]);
    });

    it('keeps its collection when the same server is chosen at another address', async () => {
        await sync();

        await updateSettings({ id: 'machine', uri: 'http://other.test:32400', serverToken: 'owner-server' });
        await sync();

        expect(errorOf('p1')).toBeUndefined();
        expect([...plex.collections.keys()]).toEqual(['900']);
        expect(membersOf('900')).toEqual(keys(1, 2, 3));
    });

    it('makes nothing when Plex does not answer with the collection list, and tries again on the next run before the interval is up', async () => {
        saved({ plex_target: 'collection', sync_interval: '7' });
        plex.fail = (method, path) => method === 'GET' && path.endsWith('/collections');
        await sync(false);
        expect(errorOf('p1')).toBe('Something went wrong while syncing: Request failed with status code 401');
        expect(plex.collections.size).toBe(0);
        expect(existsSync(join(dir, 'collections.json'))).toBe(false);

        plex.fail = undefined;
        await sync(false);

        expect(errorOf('p1')).toBeUndefined();
        expect(membersOf('900')).toEqual(keys(1, 2, 3));
    });

    it("makes the collection when the first matched track's cached key is dead, and names the dead key", async () => {
        plex.dead.add('1');

        await sync();

        expect(errorOf('p1')).toBeUndefined();
        expect(membersOf(collectionsNamed('Mix')[0] ?? '')).toEqual(keys(2, 3));
        expect(console.log).toHaveBeenCalledWith('* Plex does not have 1 matched track(s): /library/metadata/1');
    });

    it('keeps a collection in each music library the tracks are in, and finds both again on the next sync', async () => {
        plex.sections.set('3', 7);
        await sync();
        await sync();

        expect(errorOf('p1')).toBeUndefined();
        expect([...plex.collections]).toEqual([['900', { title: 'Mix', section: 6 }], ['901', { title: 'Mix', section: 7 }]]);
        expect(membersOf('900')).toEqual(keys(1, 2));
        expect(membersOf('901')).toEqual(keys(3));
        expect(read('collections.json').data).toEqual([{ id: 'p1', plex: '900' }, { id: 'p1', plex: '901' }]);
    });

    it('empties the collection of a library the playlist no longer has tracks in', async () => {
        plex.sections.set('3', 7);
        await sync();
        spotify.tracks = tracks(2);

        await sync();

        expect(membersOf('900')).toEqual(keys(1, 2));
        expect(membersOf('901')).toEqual([]);
        expect(read('collections.json').data).toEqual([{ id: 'p1', plex: '900' }, { id: 'p1', plex: '901' }]);
    });

    it('keeps the collection in one library in step while another library refuses the title', async () => {
        plex.sections.set('1', 7);
        plex.collections.set('800', { title: 'Mix', section: 7 });
        tag('1', 'Mix');

        await sync();

        expect(errorOf('p1')).toBe('Something went wrong while syncing: Plex already has a collection named "Mix" that spotify-to-plex has no record of: rename or delete it in Plex to sync this playlist as a collection');
        expect([...plex.collections]).toEqual([['800', { title: 'Mix', section: 7 }], ['900', { title: 'Mix', section: 6 }]]);
        expect(membersOf('800')).toEqual(keys(1));
        expect(membersOf('900')).toEqual(keys(2, 3));
    });

    it('drops the record of a collection deleted in Plex and keeps the others', async () => {
        plex.sections.set('3', 7);
        await sync();
        untag('3', 'Mix');
        plex.collections.delete('901');
        spotify.tracks = tracks(2);

        await sync();

        expect(read('collections.json').data).toEqual([{ id: 'p1', plex: '900' }]);
        expect(membersOf('900')).toEqual(keys(1, 2));
    });

    it('keeps syncing when the only new track has a dead key', async () => {
        await sync();
        spotify.tracks = [...tracks(3), { id: 't4', plex: 4 }];
        plex.dead.add('4');

        await sync();

        expect(errorOf('p1')).toBeUndefined();
        expect(membersOf('900')).toEqual(keys(1, 2, 3));
    });

    it.each([undefined, 'Collection', null])('makes only the playlist, and never touches collections, when plex_target is %s', async plex_target => {
        saved({ plex_target });

        await sync();

        expect(plex.playlists.size).toBe(1);
        expect(plex.requests.filter(line => line.includes('collection'))).toEqual([]);
        expect(existsSync(join(dir, 'collections.json'))).toBe(false);
    });

    it('leaves the collection as it is when no track matched', async () => {
        await sync();
        spotify.tracks = [{ id: 't9' }];

        await sync();

        expect(membersOf('900')).toEqual(keys(1, 2, 3));
    });

    it('reads the members once when the playlist has no new track', async () => {
        await sync();
        plex.requests = [];

        await sync();

        expect(plex.requests.filter(line => line.startsWith('GET /library/collections/900/children'))).toHaveLength(1);
    });

    it.each(['Mi\u0301x  Tape', 'mi\u0301x tape ', 'Mi\u0301x\u00A0Tape'])('refuses a title that only Unicode form or spacing sets apart from "%s"', async other => {
        saved({ plex_target: 'collection', title: 'M\u00EDx Tape' });
        plex.collections.set('500', { title: other, section: 6 });

        await sync();

        expect(errorOf('p1')).toMatch(/^Something went wrong while syncing: Plex already has a collection named/);
        expect(plex.collections.size).toBe(1);
    });

    it('names each track Plex did not add once, even when the playlist has it twice', async () => {
        spotify.tracks = [{ id: 't1', plex: 1 }, { id: 't2', plex: 2 }, { id: 't2-again', plex: 2 }, { id: 't3', plex: 3 }];
        plex.ignored.add('2');

        await sync();

        expect(membersOf('900')).toEqual(keys(1, 3));
        expect(console.log).toHaveBeenCalledWith('* Plex did not add 1 track(s) to the collection: /library/metadata/2');
    });

    it('puts the Spotify cover on the collection, and asks for no poster when the playlist has none', async () => {
        await sync();
        expect(plex.requests).toContain('POST /library/metadata/900/posters owner-server');

        plex.requests = [];
        spotify.image = '';
        await sync();

        expect(plex.requests.filter(line => line.includes('/posters'))).toEqual([]);
        expect(errorOf('p1')).toBeUndefined();
    });

    it("makes the collection as the server owner when the playlist syncs to a Plex Home user's account", async () => {
        write('spotify.json', [{ user: { id: 'faye', name: 'Faye', plex_home_user: { uuid: 'uuid-faye-collections', title: 'Faye' } } }]);
        saved({ plex_target: 'both', user: 'faye' });
        plexTv.post.mockReset().mockResolvedValue({ data: { authToken: 'faye-account' } });
        plexTv.get.mockReset().mockResolvedValue({ data: [{ clientIdentifier: 'machine', accessToken: 'faye-server' }] });

        await sync();

        const tokensFor = (part: string) => [...new Set(plex.requests.filter(line => line.includes(part)).map(line => line.split(' ')[2]))];
        expect(errorOf('p1')).toBeUndefined();
        expect(tokensFor('/playlists')).toEqual(['faye-server']);
        expect(tokensFor('collections')).toEqual(['owner-server']);
    });
});

describe('collection sync through the real track cache and search', () => {
    const links = (manual?: string) => write('track_links.json', tracks(3).map(track => ({ spotify_id: track.id, plex_id: [`/library/metadata/${track.plex}`], plex_checked_at: Date.now(), ...(track.id === manual ? { manual: true } : {}) })));
    beforeEach(() => { spotify.realCache = true });

    const members = () => membersOf(collectionsNamed('Mix')[0] ?? '');
    const playlistKeys = () => [...plex.playlists.values()].map(items => items.map(key => key.slice('/library/metadata/'.length)));
    beforeEach(() => saved({ plex_target: 'both' }));

    it('keeps a track whose cached link and search Plex both left unanswered this sync, in its place', async () => {
        links();
        await sync();
        expect(members()).toEqual(keys(1, 2, 3));

        plex.fail = (method, path) => method === 'GET' && (path === '/library/metadata/1' || path === '/hubs/search');
        await sync();

        expect(errorOf('p1')).toBeUndefined();
        expect(members()).toEqual(keys(1, 2, 3));
        expect(playlistKeys()).toEqual([keys(1, 2, 3)]);
    });

    it('keeps the missing status of a track Plex holds through its cached key while the search finds nothing', async () => {
        links();
        await sync();

        plex.fail = (method, path) => method === 'GET' && path === '/library/metadata/1';
        await sync();

        expect(errorOf('p1')).toBeUndefined();
        expect(members()).toEqual(keys(1, 2, 3));
        expect(existsSync(join(dir, 'missing_tracks_slskd.json')) ? read('missing_tracks_slskd.json') : []).toEqual([]);
    });

    it('keeps a hand-picked track Plex left unanswered this sync', async () => {
        links('t3');
        await sync();

        plex.fail = (method, path) => method === 'GET' && path === '/library/metadata/3';
        await sync();

        expect(members()).toEqual(keys(1, 2, 3));
        expect(playlistKeys()).toEqual([keys(1, 2, 3)]);
    });

    it('takes out a track the playlist dropped even while Plex leaves another unanswered', async () => {
        links();
        await sync();

        spotify.tracks = tracks(2);
        plex.fail = (method, path) => method === 'GET' && (path === '/library/metadata/2' || path === '/hubs/search');
        await sync();

        expect(members()).toEqual(keys(1, 2));
        expect(playlistKeys()).toEqual([keys(1, 2)]);
    });

    it('takes out a track the playlist dropped when Plex answered for every track', async () => {
        links();
        await sync();

        spotify.tracks = tracks(2);
        await sync();

        expect(members()).toEqual(keys(1, 2));
        expect(playlistKeys()).toEqual([keys(1, 2)]);
    });
});

