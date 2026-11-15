import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { updateSettings } from '@spotify-to-plex/plex-config/functions/updateSettings';
import { waitForLock } from '@spotify-to-plex/shared-utils/utils/syncLock';

import { membersOf, plex, resetPlex, tag } from './testing/fakePlexLibrary';

const { plexTv, loadSpotifyData } = vi.hoisted(() => ({ plexTv: { get: vi.fn(), post: vi.fn() }, loadSpotifyData: vi.fn() }));
vi.mock('@spotify-to-plex/http-client/plexTvClient', () => ({ plexTvClient: plexTv }));
vi.mock('@spotify-to-plex/http-client/AxiosRequest', async () => {
    const { fakeAxiosRequest } = await import('./testing/fakePlexLibrary');

    return { AxiosRequest: fakeAxiosRequest };
});
vi.mock('./loadSpotifyData', () => ({ loadSpotifyData }));
// Every track already matched in the cache, so the sync searches nothing
vi.mock('./getCachedPlexTracks', () => ({ getCachedPlexTracks: async () => ({
    result: [1, 2, 3].map(n => ({ id: `t${n}`, title: `t${n}`, artist: 'A', album: 'B', result: [{ id: `/library/metadata/${n}` }] })),
    add: vi.fn(), markChecked: vi.fn(), recheck: [], standIns: new Map<string, string>()
}) }));
vi.mock('./findMissingTidalTracks', () => ({ findMissingTidalTracks: async () => [] }));
vi.mock('@/helpers/plex/getPlexServers', async () => import('../../../web/src/helpers/plex/getPlexServers'));
vi.mock('@/helpers/errors/generateError', async () => import('../../../web/src/helpers/errors/generateError'));

let dir: string;
const write = (name: string, data: unknown) => { writeFileSync(join(dir, name), JSON.stringify(data)) };
const read = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
const saved = (plexTarget: string) => write('spotify_saved_items.json', [{ type: 'spotify-playlist', id: 'p1', title: 'Mix', uri: 'spotify:playlist:p1', image: '', sync: true, sync_interval: '0', plex_target: plexTarget }]);
const errorOf = (id: string) => read('sync_log.json').playlists.find((log: { id: string }) => log.id === id)?.error;
const collectionsNamed = (title: string) => [...plex.collections].filter(([, c]) => c.title === title).map(([ratingKey]) => ratingKey);
const newServer = { id: 'other-machine', uri: 'http://other.test:32400', serverToken: 'other-server' };

async function sync() {
    const { syncPlaylists } = await import('../jobs/playlists');
    await syncPlaylists(true);
}

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'settings-switch-'));
    process.env.STORAGE_DIR = dir;
    resetPlex();
    write('plex.json', { id: 'machine', uri: 'http://plex.test:32400', token: 'owner-account', serverToken: 'owner-server' });
    saved('collection');
    plexTv.get.mockResolvedValue({ data: [{ product: 'Plex Media Server', name: 'New', clientIdentifier: 'other-machine', accessToken: 'other-server', connections: [{ local: true, uri: 'http://other.test:32400' }] }] });
    loadSpotifyData.mockReset().mockImplementation(async () => ({ title: 'Mix', image: '', tracks: [1, 2, 3].map(n => ({ id: `t${n}`, title: `t${n}`, album: 'B', album_id: 'b', artists: ['A'] })) }));
    vi.spyOn(console, 'log').mockImplementation(() => { /* expected */ });
    vi.spyOn(console, 'error').mockImplementation(() => { /* expected */ });
});
afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
});

describe('POST /api/settings choosing another Plex server', () => {
    async function post(body: unknown) {
        const { default: handler } = await import('../../../web/pages/api/settings');
        let status = 200; let json: unknown;
        const res = { status(n: number) { status = n;

            return res }, json(b: unknown) { json = b;

            return res }, setHeader() { return res }, end() { return res } };
        await handler({ method: 'POST', url: '/api/settings', headers: {}, query: {}, body } as never, res as never);

        return { status, json };
    }

    it('refuses while a playlist sync runs, and changes nothing', async () => {
        write('collections.json', { data: [{ id: 'p1', plex: '900' }] });
        const release = await waitForLock('playlists', 0);
        try {
            const { status, json } = await post({ id: 'other-machine', uri: 'http://other.test:32400' });

            expect({ status, json }).toEqual({ status: 409, json: { error: 'A playlist sync is running: choose the new Plex server once it finishes' } });
        } finally {
            release?.();
        }

        expect(read('plex.json').id).toBe('machine');
        expect(read('collections.json').data).toEqual([{ id: 'p1', plex: '900' }]);
    });

    it("switches when no playlist sync runs, and drops the old server's records", async () => {
        write('collections.json', { data: [{ id: 'p1', plex: '900' }] });

        const { status, json } = await post({ id: 'other-machine', uri: 'http://other.test:32400' });

        expect({ status, json }).toEqual({ status: 200, json: { loggedin: true, uri: 'http://other.test:32400', id: 'other-machine' } });
        expect(read('plex.json')).toMatchObject(newServer);
        expect(existsSync(join(dir, 'collections.json'))).toBe(false);
    });
});

describe('playlist sync across a Plex server switch', () => {
    it("leaves a new server's playlist and collection alone when they carry the keys saved for the old server", async () => {
        saved('both');
        write('playlists.json', { data: [{ id: 'p1', plex: '700' }] });
        write('collections.json', { data: [{ id: 'p1', plex: '800' }] });
        plex.playlists.set('700', ['/library/metadata/7']);
        plex.collections.set('800', { title: 'Road Trip', section: 6 });
        tag('7', 'Road Trip');

        await updateSettings(newServer);
        await sync();

        expect(plex.playlists.get('700')).toEqual(['/library/metadata/7']);
        expect([...plex.playlists.values()]).toContainEqual(['/library/metadata/1', '/library/metadata/2', '/library/metadata/3']);
        expect(plex.collections.get('800')?.title).toBe('Road Trip');
        expect(membersOf('800')).toEqual(['7']);
        expect(membersOf(collectionsNamed('Mix')[0] ?? '')).toEqual(['1', '2', '3']);
    });

    it('refuses a server switch while a playlist sync runs, and keeps what that sync saved', async () => {
        const load = loadSpotifyData.getMockImplementation();
        let refused: unknown;
        loadSpotifyData.mockImplementationOnce(async (...args: unknown[]) => {
            refused = await updateSettings(newServer).then(() => 'switched', (error: unknown) => error instanceof Error ? error.message : error);

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
        expect(membersOf('900')).toEqual(['1', '2', '3']);
    });
});
