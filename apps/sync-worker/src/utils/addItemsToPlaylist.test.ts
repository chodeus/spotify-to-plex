import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// plex-helpers has no test runner; the worker's vitest aliases reach its source
vi.mock('@spotify-to-plex/http-client/AxiosRequest', () => ({ AxiosRequest: { put: vi.fn() } }));

const { AxiosRequest } = await import('@spotify-to-plex/http-client/AxiosRequest');
const { addItemsToPlaylist } = await import('@spotify-to-plex/plex-helpers/playlist/addItemsToPlaylist');

const putMock = AxiosRequest.put as unknown as Mock;
const settings = { uri: 'http://plex.test:32400', token: 'token', id: 'machine' };
const items = ['1', '2', '3'].map(id => ({ key: `/library/metadata/${id}` }));
const answered = (status: number) => Object.assign(new Error(`Request failed with status code ${status}`), { response: { status } });
const isFor = (id: string) => (url: string) => url.includes(encodeURIComponent(`/library/metadata/${id}`));

describe('addItemsToPlaylist', () => {
    beforeEach(() => {
        putMock.mockReset();
        vi.spyOn(console, 'error').mockImplementation(() => { /* expected */ });
    });

    it('adds every item and returns nothing refused', async () => {
        putMock.mockResolvedValue({});

        await expect(addItemsToPlaylist(settings, '500', items, { retryDelay: 0 })).resolves.toEqual([]);
        expect(putMock).toHaveBeenCalledTimes(3);
    });

    it('returns an item Plex refused and still adds the rest', async () => {
        putMock.mockImplementation((url: string) => (isFor('2')(url) ? Promise.reject(answered(404)) : Promise.resolve({})));

        await expect(addItemsToPlaylist(settings, '500', items, { retryDelay: 0 })).resolves.toEqual(['/library/metadata/2']);
        expect(putMock.mock.calls.filter(([url]) => isFor('3')(url as string))).toHaveLength(1);
    });

    // Every remaining item would wait out its own retry against a Plex that is gone
    it('stops at the first item Plex does not answer', async () => {
        putMock.mockRejectedValue(new Error('connect ECONNREFUSED'));

        await expect(addItemsToPlaylist(settings, '500', items, { retryDelay: 0 })).rejects.toThrow('ECONNREFUSED');
        expect(putMock.mock.calls.every(([url]) => isFor('1')(url as string))).toBe(true);
    });

    it('stops on a failure that is not about the item', async () => {
        for (const status of [503, 429, 401, 403]) {
            putMock.mockReset();
            putMock.mockRejectedValue(answered(status));

            await expect(addItemsToPlaylist(settings, '500', items, { retryDelay: 0 })).rejects.toMatchObject({ response: { status } });
            expect(putMock.mock.calls.every(([url]) => isFor('1')(url as string))).toBe(true);
        }
    });
});
