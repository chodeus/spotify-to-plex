import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/helpers/errors/generateError', async () => import('../../../web/src/helpers/errors/generateError'));

let dir: string;
const write = (name: string, data: unknown) => { writeFileSync(join(dir, name), JSON.stringify(data)) };
const read = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8'));

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'saved-items-'));
    process.env.STORAGE_DIR = dir;
    write('spotify_saved_items.json', [{ type: 'spotify-playlist', id: 'p1', title: 'Mix', uri: 'spotify:playlist:p1', image: '', plex_target: 'collection' }]);
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
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

        expect({ status, json }).toEqual({ status: 400, json: { error: 'plex_target applies to playlists only' } });
        expect(read('spotify_saved_items.json')[0].plex_target).toBeUndefined();
    });
});
