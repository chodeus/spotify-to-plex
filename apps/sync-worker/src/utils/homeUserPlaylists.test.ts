import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A fake Plex server: one playlist store, tokens that can be revoked mid-request
const { plexTv, server } = vi.hoisted(() => {
    const server = {
        playlists: new Map<string, { token: string, title: string, items: string[] }>(),
        valid: new Set<string>(),
        revokeAfterPuts: undefined as undefined | { token: string, after: number },
        puts: 0,
        nextKey: 900,
    };

    return { plexTv: { get: vi.fn(), post: vi.fn() }, server };
});
const unauthorized = () => Object.assign(new Error('Request failed with status code 401'), { response: { status: 401 } });
const keyOf = (uri: string) => uri.slice(uri.indexOf('/library/'));

vi.mock('@spotify-to-plex/http-client/plexTvClient', () => ({ plexTvClient: plexTv }));
vi.mock('@spotify-to-plex/http-client/AxiosRequest', () => ({
    AxiosRequest: {
        get: async (url: string, token: string) => {
            if (!server.valid.has(token))
                throw unauthorized();

            const { pathname } = new URL(url);
            const items = /^\/playlists\/(\d+)\/items$/.exec(pathname);
            if (items) return { data: { MediaContainer: { Metadata: (server.playlists.get(items[1]!)?.items ?? []).map(uri => ({ key: keyOf(uri) })) } } };

            if (pathname === '/playlists') {
                const visible = [...server.playlists.entries()].filter(([, p]) => p.token.split('-')[0] === token.split('-')[0]);

                return { data: { MediaContainer: { size: visible.length, ...(visible.length ? { Metadata: visible.map(([ratingKey, p]) => ({ ratingKey, title: p.title })) } : {}) } } };
            }

            throw new Error(`unexpected GET ${pathname}`);
        },
        post: async (url: string, token: string) => {
            if (!server.valid.has(token))
                throw unauthorized();

            const u = new URL(url);
            const ratingKey = String(server.nextKey++);
            server.playlists.set(ratingKey, { token, title: u.searchParams.get('title')!, items: [u.searchParams.get('uri')!] });

            return { data: { MediaContainer: { size: 1, Metadata: [{ ratingKey }] } } };
        },
        put: async (url: string, token: string) => {
            if (!server.valid.has(token))
                throw unauthorized();

            const u = new URL(url);
            const items = /^\/playlists\/(\d+)\/items$/.exec(u.pathname);
            if (items) {
                server.puts++;
                server.playlists.get(items[1]!)!.items.push(u.searchParams.get('uri')!);
                if (server.revokeAfterPuts?.token === token && server.puts >= server.revokeAfterPuts.after)
                    server.valid.delete(token);
            }

            return { data: {} };
        },
        delete: async (url: string, token: string) => {
            if (!server.valid.has(token))
                throw unauthorized();

            const items = /^\/playlists\/(\d+)\/items$/.exec(new URL(url).pathname);
            if (items)
                server.playlists.get(items[1]!)!.items = [];

            return { data: {} };
        },
    }
}));
const { loadSpotifyData } = vi.hoisted(() => ({ loadSpotifyData: vi.fn() }));
vi.mock('../utils/loadSpotifyData', () => ({ loadSpotifyData }));
vi.mock('@spotify-to-plex/music-search/functions/getMusicSearchConfig', () => ({ getMusicSearchConfig: async () => ({ searchApproaches: [{ id: 'normal' }] }) }));
vi.mock('../utils/getCachedPlexTracks', () => ({ getCachedPlexTracks: async () => ({
    result: [0, 1, 2, 3].map(n => ({ id: `t${n}`, title: `T${n}`, artist: 'A', album: 'B', result: [{ id: `/library/metadata/${n}` }] })),
    add: vi.fn(), markChecked: vi.fn(), recheck: [] }) }));
vi.mock('../utils/findMissingTidalTracks', () => ({ findMissingTidalTracks: async () => [] }));
// The web route's own helpers sit behind the web app's "@/" alias
vi.mock('@/helpers/errors/generateError', async () => import('../../../web/src/helpers/errors/generateError'));
vi.mock('@/helpers/plex/getPlaylistLink', async () => import('../../../web/src/helpers/plex/getPlaylistLink'));

let dir: string;
let run = 0;
const write = (name: string, data: unknown) => { writeFileSync(join(dir, name), JSON.stringify(data)) };
const track = (n: number) => ({ key: `/library/metadata/${n}` });
const playlistItems = (ratingKey: string) => server.playlists.get(ratingKey)?.items.map(keyOf);

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'home-user-playlists-'));
    process.env.STORAGE_DIR = dir;
    server.playlists.clear();
    server.valid = new Set(['owner-server', 'faye-stale', 'faye-fresh']);
    server.revokeAfterPuts = undefined;
    server.puts = 0;
    server.nextKey = 900;
    write('plex.json', { id: 'machine', uri: 'http://plex.test:32400', token: 'owner-account', serverToken: 'owner-server' });
    write('spotify.json', [{ user: { id: 'faye', name: 'Faye', plex_home_user: { uuid: `uuid-faye-${run++}`, title: 'Faye' } } }]);
    write('spotify_saved_items.json', [{ type: 'spotify-playlist', id: 'p1', title: 'p1', uri: 'spotify:playlist:p1', user: 'faye', sync: true, sync_interval: '0' }]);
    plexTv.post.mockReset().mockResolvedValue({ data: { authToken: 'faye-account' } });
    plexTv.get.mockReset()
        .mockResolvedValueOnce({ data: [{ clientIdentifier: 'machine', accessToken: 'faye-stale' }] })
        .mockResolvedValue({ data: [{ clientIdentifier: 'machine', accessToken: 'faye-fresh' }] });
    vi.spyOn(console, 'log').mockImplementation(() => { /* expected */ });
    vi.spyOn(console, 'error').mockImplementation(() => { /* expected */ });
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }) });

async function callRoute(method: string, body: unknown, route = 'playlists/index') {
    const { default: handler } = route == 'spotify/users' ? await import('../../../web/pages/api/spotify/users') : await import('../../../web/pages/api/playlists/index');
    let status = 200; let json: unknown;
    const res = { status(n: number) { status = n;

        return res }, json(b: unknown) { json = b;

        return res }, setHeader() { return res }, end() { return res } };
    await handler({ method, url: '/api/playlists', headers: {}, query: {}, body } as never, res as never);

    return { status, json };
}

describe('POST /api/playlists, Home user token revoked part-way through the adds', () => {
    it('leaves each track in the created playlist once', async () => {
        server.revokeAfterPuts = { token: 'faye-stale', after: 2 };

        const { status, json } = await callRoute('POST', { id: 'p1', name: 'P1', type: 'playlist', items: [track(0), track(1), track(2), track(3)] });

        expect(status).toBe(200);
        expect(json).toMatchObject({ id: '900', refused: [] });
        expect(server.playlists.size).toBe(1);
        expect(playlistItems('900')).toEqual(['/library/metadata/0', '/library/metadata/1', '/library/metadata/2', '/library/metadata/3']);
    });
});

describe('playlist sync for a Home user, through the real putPlexPlaylist', () => {
    beforeEach(() => {
        loadSpotifyData.mockReset().mockResolvedValue({ title: 'P1', image: '', tracks: [0, 1, 2, 3].map(n => ({ id: `t${n}`, title: `T${n}`, album: 'B', album_id: 'b', artists: ['A'] })) });
    });

    it('a token revoked part-way through the adds still ends with one playlist holding each track once', async () => {
        server.revokeAfterPuts = { token: 'faye-stale', after: 2 };
        const { syncPlaylists } = await import('../jobs/playlists');

        await syncPlaylists(true);

        expect(server.playlists.size).toBe(1);
        expect(playlistItems('900')).toEqual(['/library/metadata/0', '/library/metadata/1', '/library/metadata/2', '/library/metadata/3']);
        expect(JSON.parse(readFileSync(join(dir, 'playlists.json'), 'utf8')).data).toEqual([{ type: 'playlist', id: 'p1', plex: '900' }]);
        // The retry ran: a fresh token was fetched after the stale one was rejected
        expect(plexTv.get).toHaveBeenCalledTimes(2);
        expect(server.valid.has('faye-stale')).toBe(false);
    });

    it("an owner's playlist recorded before the mapping gets a new copy in the Home user's account, and the record moves to it", async () => {
        server.playlists.set('800', { token: 'owner-server', title: 'P1', items: ['server://machine/com.plexapp.plugins.library/library/metadata/0'] });
        server.nextKey = 900;
        write('playlists.json', { data: [{ type: 'playlist', id: 'p1', plex: '800' }] });
        const { syncPlaylists } = await import('../jobs/playlists');

        await syncPlaylists(true);

        expect(server.playlists.get('900')?.token.startsWith('faye')).toBe(true);
        expect(playlistItems('900')).toEqual(['/library/metadata/0', '/library/metadata/1', '/library/metadata/2', '/library/metadata/3']);
        expect(playlistItems('800')).toEqual(['/library/metadata/0']);
        expect(JSON.parse(readFileSync(join(dir, 'playlists.json'), 'utf8')).data).toEqual([{ type: 'playlist', id: 'p1', plex: '900' }]);
    });
});

describe('web routes for a Home user', () => {
    // The page offers Create when its lookup failed, even though the playlist exists
    it('POST refills the playlist already recorded for the item rather than making a second one', async () => {
        server.playlists.set('900', { token: 'faye-fresh', title: 'P1', items: ['server://machine/com.plexapp.plugins.library/library/metadata/0'] });
        server.nextKey = 901;
        write('playlists.json', { data: [{ type: 'playlist', id: 'p1', plex: '900' }] });

        const { json } = await callRoute('POST', { id: 'p1', name: 'P1', type: 'playlist', items: [track(1), track(2)] });

        expect(server.playlists.size).toBe(1);
        expect(json).toMatchObject({ id: '900' });
        expect(playlistItems('900')).toEqual(['/library/metadata/1', '/library/metadata/2']);
    });

    it("PUT /api/spotify/users names plex.tv when it can't be reached to check the picked Home user", async () => {
        write('spotify.json', [{ user: { id: 'faye', name: 'Faye' } }]);
        plexTv.get.mockReset().mockRejectedValue(Object.assign(new Error('timeout of 10000ms exceeded'), { code: 'ECONNABORTED' }));

        const { status, json } = await callRoute('PUT', { id: 'faye', plex_home_user: 'uuid-faye' }, 'spotify/users');

        expect({ status, json }).toEqual({ status: 502, json: { error: 'Plex Home users could not be loaded' } });
    });
});
