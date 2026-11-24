import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/helpers/errors/generateError', async () => import('../../../web/src/helpers/errors/generateError'));
vi.mock('@/helpers/plex/playlistWriteError', async () => import('../../../web/src/helpers/plex/playlistWriteError'));

let dir: string;
const write = (name: string, data: unknown) => { writeFileSync(join(dir, name), JSON.stringify(data)) };
const read = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8'));

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'saved-items-'));
    process.env.STORAGE_DIR = dir;
    write('spotify_saved_items.json', [{ type: 'spotify-playlist', id: 'p1', title: 'Mix', uri: 'spotify:playlist:p1', image: '', plex_target: 'collection' }]);
});
afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
});

async function call(method: 'PUT' | 'POST', body: unknown) {
    const { default: handler } = await import('../../../web/pages/api/saved-items/index');
    let status = 200; let json: unknown;
    const res = { status(n: number) { status = n;

        return res }, json(b: unknown) { json = b;

        return res }, setHeader() { return res }, end() { return res } };
    await handler({ method, url: '/api/saved-items', headers: {}, query: {}, body } as never, res as never);

    return { status, json };
}
const put = (body: unknown) => call('PUT', body);

describe('PUT /api/saved-items plex_target', () => {
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

        expect({ status, json }).toEqual({ status: 400, json: { error: 'plex_target applies to playlists only' } });
        expect(read('spotify_saved_items.json')[0].plex_target).toBeUndefined();
    });
});

describe('/api/saved-items title', () => {
    it.each(['', '   '])('refuses a blank title (%j) and saves nothing', async title => {
        const { status, json } = await put({ ids: ['p1'], title, label: 'x' });

        expect({ status, json }).toEqual({ status: 400, json: { error: 'The title cannot be blank' } });
        expect(read('spotify_saved_items.json')[0]).toMatchObject({ title: 'Mix' });
        expect(read('spotify_saved_items.json')[0].label).toBeUndefined();
    });

    it('names liked songs "Liked Songs" when the label is blank', async () => {
        vi.stubEnv('SPOTIFY_API_CLIENT_ID', 'client');
        vi.stubEnv('SPOTIFY_API_CLIENT_SECRET', 'secret');
        write('spotify.json', [{ user: { id: 'u1', name: 'Faye' } }]);

        const { status } = await call('POST', { search: 'faye:liked', label: '  ' });

        expect(status).toBe(200);
        expect(read('spotify_saved_items.json').find((item: { id: string }) => item.id === 'liked-u1')?.title).toBe('Liked Songs');
    });
});

describe('POST /api/saved-items search', () => {
    it.each(['', '   '])('asks for a URL or URI when the search is blank (%j) and saves nothing', async search => {
        vi.stubEnv('SPOTIFY_API_CLIENT_ID', 'client');
        vi.stubEnv('SPOTIFY_API_CLIENT_SECRET', 'secret');

        const { status, json } = await call('POST', { search });

        expect({ status, json }).toEqual({ status: 400, json: { error: 'Enter a Spotify URL or URI to add' } });
        expect(read('spotify_saved_items.json')).toHaveLength(1);
    });
});
