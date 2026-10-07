import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// http-client has no test runner; the worker's vitest aliases reach its source
vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));

const { default: axios } = await import('axios');
const { axiosGet } = await import('@spotify-to-plex/http-client/methods/axiosGet');
const { axiosPost } = await import('@spotify-to-plex/http-client/methods/axiosPost');
const { axiosPut } = await import('@spotify-to-plex/http-client/methods/axiosPut');
const { axiosDelete } = await import('@spotify-to-plex/http-client/methods/axiosDelete');

const configOf = (mock: unknown) => (mock as Mock).mock.calls[0]?.at(-1) as { timeout?: number; httpsAgent?: { options: { rejectUnauthorized?: boolean } } };

describe('Plex HTTP methods', () => {
    beforeEach(() => {
        for (const method of ['get', 'post', 'put', 'delete'] as const)
            (axios[method] as unknown as Mock).mockReset();
    });

    // Without a limit, a Plex that stops answering hangs the playlist job
    it('gives every write a timeout', async () => {
        await axiosPost('http://plex.test:32400/playlists', 'token');
        await axiosPut('http://plex.test:32400/playlists/1/items', 'token');
        await axiosDelete('http://plex.test:32400/playlists/1/items', 'token');

        expect([configOf(axios.post).timeout, configOf(axios.put).timeout, configOf(axios.delete).timeout]).toEqual([30_000, 30_000, 30_000]);
    });

    it('checks certificates for a host name and not for an IP address', async () => {
        await axiosGet('https://plex.example.com/library', 'token');
        await axiosPut('https://10.0.0.5:32400/playlists/1/items', 'token');

        expect(configOf(axios.get).httpsAgent).toBeUndefined();
        expect(configOf(axios.put).httpsAgent?.options.rejectUnauthorized).toBe(false);
    });
});
