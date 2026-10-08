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

    // A title of only stripped characters ("...") left nothing to ask, and read as a failed search
    it('answers a query with nothing left to search with no match, without asking Plex', async () => {
        await expect(hubSearch('http://plex.test:32400', 'token', '...')).resolves.toEqual([]);
        expect(getMock).not.toHaveBeenCalled();
    });

    it('waits out a Retry-After and asks Plex once more', async () => {
        getMock.mockRejectedValueOnce(Object.assign(new Error('Request failed with status code 429'), { response: { status: 429, headers: { 'retry-after': '0' } } }))
            .mockResolvedValueOnce({ data: { MediaContainer: { Hub: [] } } });

        await expect(hubSearch('http://plex.test:32400', 'token', 'Song')).resolves.toEqual([]);
        expect(getMock).toHaveBeenCalledTimes(2);
    });

    // Without a wait to honour, a retry would only hit a struggling Plex again at once
    it('fails a query Plex answered with a 5xx and no Retry-After, without retrying', async () => {
        getMock.mockRejectedValue(Object.assign(new Error('Request failed with status code 503'), { response: { status: 503, headers: {} } }));

        await expect(hubSearch('http://plex.test:32400', 'token', 'Song')).rejects.toBe('Plex answered 503');
        expect(getMock).toHaveBeenCalledTimes(1);
    });
});
