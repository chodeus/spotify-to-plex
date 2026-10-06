import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// plex-music-search has no test runner; the worker's vitest aliases reach its source
vi.mock('@spotify-to-plex/http-client/AxiosRequest', () => ({ AxiosRequest: { get: vi.fn() } }));

const { AxiosRequest } = await import('@spotify-to-plex/http-client/AxiosRequest');
const { default: hubSearch } = await import('@spotify-to-plex/plex-music-search/actions/hubSearch');

const getMock = AxiosRequest.get as unknown as Mock;

describe('hubSearch', () => {
    beforeEach(() => {
        getMock.mockReset();
        vi.spyOn(console, 'error').mockImplementation(() => { /* expected */ });
    });

    it('says when Plex answered with an error', async () => {
        getMock.mockRejectedValue(Object.assign(new Error('Request failed with status code 401'), { response: { status: 401 } }));

        await expect(hubSearch('http://plex.test:32400', 'token', 'Song')).rejects.toBe('Plex answered 401');
    });

    it('says when Plex could not be reached', async () => {
        getMock.mockRejectedValue(new Error('connect ECONNREFUSED'));

        await expect(hubSearch('http://plex.test:32400', 'token', 'Song')).rejects.toBe('Could not connect to server');
    });
});
