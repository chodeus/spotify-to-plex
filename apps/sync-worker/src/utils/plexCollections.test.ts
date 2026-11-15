import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A fake Plex library that, like the real one, ties tracks to a collection by its title, ignoring case
const { plex, plexTv, spotify } = vi.hoisted(() => ({
    plex: {
        collections: new Map<string, { title: string, section: number }>(),
        tags: new Map<string, Set<string>>(),
        playlists: new Map<string, string[]>(),
        nextKey: 900,
        ignored: new Set<string>(),
        fail: undefined as undefined | ((method: string, path: string) => boolean),
        requests: [] as string[],
    },
    plexTv: { get: vi.fn(), post: vi.fn() },
    spotify: { tracks: [] as { id: string, plex?: number }[], image: '' },
}));

const httpError = (status: number) => Object.assign(new Error(`Request failed with status code ${status}`), { response: { status } });
const ok = () => ({ data: {} });
const created = (ratingKey: string) => ({ data: { MediaContainer: { size: 1, Metadata: [{ ratingKey }] } } });
const route = (path: string, pattern: RegExp) => pattern.exec(path)?.[1];
const libraryKey = (uri: string) => uri.slice(uri.indexOf('/library/'));

function membersOf(ratingKey: string) {
    const title = plex.collections.get(ratingKey)?.title.toLowerCase();

    return [...plex.tags.entries()].filter(([, tags]) => !!title && tags.has(title)).map(([n]) => n)
        .sort((a, b) => Number(a) - Number(b));
}
function tag(n: string, title: string) {
    if (!plex.ignored.has(n))
        plex.tags.set(n, (plex.tags.get(n) ?? new Set()).add(title.toLowerCase()));
}
function untag(n: string, title: string) {
    plex.tags.get(n)?.delete(title.toLowerCase());
}
// Plex takes a comma list of ratingKeys; a URL naming too many is refused
function keysIn(uri: string) {
    const keys = uri.slice(uri.indexOf('/library/metadata/') + '/library/metadata/'.length).split(',');
    if (keys.length > 100)
        throw httpError(414);

    return keys;
}
function request(method: string, url: string, token: string) {
    const parsed = new URL(url);
    plex.requests.push(`${method} ${parsed.pathname} ${token}`);
    if (plex.fail?.(method, parsed.pathname))
        throw httpError(401);

    return parsed;
}
function libraryItem(n: string) {
    const collection = plex.collections.get(n);
    if (collection)
        return { ratingKey: n, key: `/library/metadata/${n}`, type: 'collection', title: collection.title, librarySectionID: collection.section };

    if (Number(n) < 900)
        return { ratingKey: n, key: `/library/metadata/${n}`, type: 'track', title: `T${n}`, librarySectionID: 6 };

    throw httpError(404);
}

vi.mock('@spotify-to-plex/http-client/plexTvClient', () => ({ plexTvClient: plexTv }));
vi.mock('@spotify-to-plex/http-client/AxiosRequest', () => ({
    AxiosRequest: {
        get: async (url: string, token: string) => {
            const { pathname } = request('GET', url, token);
            if (pathname.endsWith('/posters'))
                return { data: { MediaContainer: { size: 1 } } };

            const item = route(pathname, /^\/library\/metadata\/(\d+)$/);
            if (item)
                return { data: { MediaContainer: { size: 1, Metadata: [libraryItem(item)] } } };

            const section = route(pathname, /^\/library\/sections\/(\d+)\/collections$/);
            if (section) {
                const list = [...plex.collections].filter(([, c]) => String(c.section) === section).map(([ratingKey, c]) => ({ ratingKey, title: c.title }));

                return { data: { MediaContainer: { size: list.length, ...(list.length > 0 ? { Metadata: list } : {}) } } };
            }

            const children = route(pathname, /^\/library\/collections\/(\d+)\/children$/);
            if (children)
                return { data: { MediaContainer: { Metadata: membersOf(children).map(n => ({ key: `/library/metadata/${n}` })) } } };

            if (pathname === '/playlists')
                return { data: { MediaContainer: { Metadata: [...plex.playlists.keys()].map(ratingKey => ({ ratingKey, title: 'Mix' })) } } };

            const playlist = route(pathname, /^\/playlists\/(\d+)\/items$/);
            if (playlist)
                return { data: { MediaContainer: { Metadata: (plex.playlists.get(playlist) ?? []).map(key => ({ key })) } } };

            throw new Error(`unexpected GET ${pathname}`);
        },
        post: async (url: string, token: string) => {
            const parsed = request('POST', url, token);
            if (parsed.pathname.endsWith('/posters'))
                return ok();

            const ratingKey = String(plex.nextKey++);
            const uri = parsed.searchParams.get('uri') ?? '';
            if (parsed.pathname === '/playlists') {
                plex.playlists.set(ratingKey, [libraryKey(uri)]);

                return created(ratingKey);
            }

            if (parsed.pathname === '/library/collections') {
                const title = parsed.searchParams.get('title') ?? '';
                plex.collections.set(ratingKey, { title, section: Number(parsed.searchParams.get('sectionId')) });

                for (const n of keysIn(uri))
                    tag(n, title);

                return created(ratingKey);
            }

            throw new Error(`unexpected POST ${parsed.pathname}`);
        },
        put: async (url: string, token: string) => {
            const parsed = request('PUT', url, token);
            const items = route(parsed.pathname, /^\/library\/collections\/(\d+)\/items$/);
            if (items) {
                const title = plex.collections.get(items)?.title ?? '';

                for (const n of keysIn(parsed.searchParams.get('uri') ?? ''))
                    tag(n, title);

                return ok();
            }

            if (route(parsed.pathname, /^\/library\/sections\/(\d+)\/all$/)) {
                const id = parsed.searchParams.get('id') ?? '';
                const collection = plex.collections.get(id);
                const members = membersOf(id);
                if (!collection)
                    throw httpError(404);

                for (const n of members)
                    untag(n, collection.title);
                collection.title = parsed.searchParams.get('title.value') ?? '';

                for (const n of members)
                    tag(n, collection.title);

                return ok();
            }

            const playlist = route(parsed.pathname, /^\/playlists\/(\d+)\/items$/);
            if (playlist) {
                plex.playlists.get(playlist)?.push(libraryKey(parsed.searchParams.get('uri') ?? ''));

                return ok();
            }

            if (/^\/playlists\/\d+$/.test(parsed.pathname) || parsed.pathname.endsWith('/poster'))
                return ok();

            throw new Error(`unexpected PUT ${parsed.pathname}`);
        },
        delete: async (url: string, token: string) => {
            const parsed = request('DELETE', url, token);
            const child = /^\/library\/collections\/(\d+)\/children\/(\d+)$/.exec(parsed.pathname);
            if (child) {
                untag(child[2] ?? '', plex.collections.get(child[1] ?? '')?.title ?? '');

                return ok();
            }

            const playlist = route(parsed.pathname, /^\/playlists\/(\d+)\/items$/);
            if (playlist) {
                plex.playlists.set(playlist, []);

                return ok();
            }

            throw new Error(`unexpected DELETE ${parsed.pathname}`);
        },
    }
}));
const { loadSpotifyData } = vi.hoisted(() => ({ loadSpotifyData: vi.fn() }));
vi.mock('./loadSpotifyData', () => ({ loadSpotifyData }));
vi.mock('@spotify-to-plex/music-search/functions/getMusicSearchConfig', () => ({ getMusicSearchConfig: async () => ({ searchApproaches: [{ id: 'normal' }] }) }));
vi.mock('./getCachedPlexTracks', () => ({ getCachedPlexTracks: async () => ({
    result: spotify.tracks.map(track => ({ id: track.id, title: track.id, artist: 'A', album: 'B', result: track.plex === undefined ? [] : [{ id: `/library/metadata/${track.plex}` }] })),
    add: vi.fn(), markChecked: vi.fn(), recheck: [] }) }));
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

async function sync() {
    const { syncPlaylists } = await import('../jobs/playlists');
    await syncPlaylists(true);
}

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'plex-collections-'));
    process.env.STORAGE_DIR = dir;
    plex.collections.clear();
    plex.tags.clear();
    plex.playlists.clear();
    plex.ignored.clear();
    plex.nextKey = 900;
    plex.fail = undefined;
    plex.requests = [];
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
    });

    it('renames the collection with the playlist, keeping its tracks', async () => {
        await sync();
        saved({ plex_target: 'collection', title: 'Mix 2' });

        await sync();

        expect([...plex.collections]).toEqual([['900', { title: 'Mix 2', section: 6 }]]);
        expect(membersOf('900')).toEqual(keys(1, 2, 3));
    });

    it('as both, makes the playlist and the collection', async () => {
        saved({ plex_target: 'both' });

        await sync();

        expect([...plex.playlists.values()]).toEqual([['/library/metadata/1', '/library/metadata/2', '/library/metadata/3']]);
        expect(membersOf(collectionsNamed('Mix')[0] ?? '')).toEqual(keys(1, 2, 3));
    });

    it('with no target set, makes only the playlist and never touches collections', async () => {
        saved();

        await sync();

        expect(plex.playlists.size).toBe(1);
        expect(plex.requests.filter(line => line.includes('collection'))).toEqual([]);
        expect(existsSync(join(dir, 'collections.json'))).toBe(false);
    });

    it('leaves a collection it did not make alone when its title is taken, ignoring case, and still syncs the rest', async () => {
        plex.collections.set('800', { title: 'MIX', section: 6 });
        tag('7', 'MIX');
        saved({ plex_target: 'both' });

        await sync();

        expect([...plex.collections.keys()]).toEqual(['800']);
        expect(membersOf('800')).toEqual(keys(7));
        expect([...plex.playlists.values()]).toEqual([['/library/metadata/1', '/library/metadata/2', '/library/metadata/3']]);
        expect(errorOf('p1')).toBe('Something went wrong while syncing: Plex already has a collection named "MIX"; rename it or this playlist to sync the playlist as a collection');
        // The missing lists are rebuilt from this state, so the playlist's sync still counts
        expect(Object.keys(read('playlists_sync_state.json'))).toEqual(['p1']);
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

    it('makes nothing when Plex does not answer with the collection list', async () => {
        plex.fail = (method, path) => method === 'GET' && path.endsWith('/collections');

        await sync();

        expect(plex.collections.size).toBe(0);
        expect(existsSync(join(dir, 'collections.json'))).toBe(false);
        expect(errorOf('p1')).toBe('Something went wrong while syncing: Request failed with status code 401');
    });

    it('leaves the collection as it is when no track matched', async () => {
        await sync();
        spotify.tracks = [{ id: 't9' }];

        await sync();

        expect(membersOf('900')).toEqual(keys(1, 2, 3));
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

describe('PUT /api/saved-items plex_target', () => {
    async function put(body: unknown) {
        const { default: handler } = await import('../../../web/pages/api/saved-items/index');
        let status = 200; let json: unknown;
        const res = { status(n: number) { status = n;

            return res }, json(b: unknown) { json = b;

            return res }, setHeader() { return res }, end() { return res } };
        await handler({ method: 'PUT', url: '/api/saved-items', headers: {}, query: {}, body } as never, res as never);

        return { status, json };
    }

    it('saves a valid choice on a playlist', async () => {
        const { status } = await put({ ids: ['p1'], plex_target: 'both' });

        expect(status).toBe(200);
        expect(read('spotify_saved_items.json')[0].plex_target).toBe('both');
    });

    it('refuses a value it does not know and saves nothing', async () => {
        const { status, json } = await put({ ids: ['p1'], plex_target: 'Collection', label: 'x' });

        expect({ status, json }).toEqual({ status: 400, json: { error: 'plex_target must be one of: playlist, collection, both' } });
        expect(read('spotify_saved_items.json')[0]).toMatchObject({ plex_target: 'collection' });
        expect(read('spotify_saved_items.json')[0].label).toBeUndefined();
    });

    it('refuses it for an album and saves nothing', async () => {
        write('spotify_saved_items.json', [{ type: 'spotify-album', id: 'a1', title: 'Album', uri: 'spotify:album:a1', image: '' }]);

        const { status, json } = await put({ ids: ['a1'], plex_target: 'collection' });

        expect({ status, json }).toEqual({ status: 400, json: { error: 'Only playlists can be synced as a Plex collection' } });
        expect(read('spotify_saved_items.json')[0].plex_target).toBeUndefined();
    });
});
