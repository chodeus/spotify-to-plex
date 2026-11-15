import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { waitForLock } from '@spotify-to-plex/shared-utils/utils/syncLock';

const { plexTv } = vi.hoisted(() => ({ plexTv: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@spotify-to-plex/http-client/plexTvClient', () => ({ plexTvClient: plexTv }));
// The route's check that the chosen connection answers
vi.mock('@spotify-to-plex/http-client/AxiosRequest', () => ({ AxiosRequest: { get: async () => ({ data: {} }) } }));
vi.mock('@/helpers/plex/getPlexServers', async () => import('../../../web/src/helpers/plex/getPlexServers'));
vi.mock('@/helpers/errors/generateError', async () => import('../../../web/src/helpers/errors/generateError'));

let dir: string;
const write = (name: string, data: unknown) => { writeFileSync(join(dir, name), JSON.stringify(data)) };
const read = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8'));

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'settings-switch-'));
    process.env.STORAGE_DIR = dir;
    write('plex.json', { id: 'machine', uri: 'http://plex.test:32400', token: 'owner-account', serverToken: 'owner-server' });
    write('collections.json', { data: [{ id: 'p1', plex: '900' }] });
    plexTv.get.mockResolvedValue({ data: [{ product: 'Plex Media Server', name: 'New', clientIdentifier: 'other-machine', accessToken: 'other-server', connections: [{ local: true, uri: 'http://other.test:32400' }] }] });
    vi.spyOn(console, 'log').mockImplementation(() => { /* expected */ });
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
        const { status, json } = await post({ id: 'other-machine', uri: 'http://other.test:32400' });

        expect({ status, json }).toEqual({ status: 200, json: { loggedin: true, uri: 'http://other.test:32400', id: 'other-machine' } });
        expect(read('plex.json')).toMatchObject({ id: 'other-machine', uri: 'http://other.test:32400', serverToken: 'other-server' });
        expect(existsSync(join(dir, 'collections.json'))).toBe(false);
    });
});
