import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// http-client and plex-music-search have no test runner; the worker's vitest aliases reach their source
vi.mock('@spotify-to-plex/http-client/AxiosRequest', () => ({ AxiosRequest: { get: vi.fn() } }));

const { plexHttpsAgent } = await import('@spotify-to-plex/http-client/methods/plexHttpsAgent');
const { AxiosRequest } = await import('@spotify-to-plex/http-client/AxiosRequest');
const { getMetadata } = await import('@spotify-to-plex/plex-music-search/actions/getMetadata');

const getMock = AxiosRequest.get as unknown as Mock;
const answered = (status: number) => Object.assign(new Error(`Request failed with status code ${status}`), { response: { status } });

describe('plexHttpsAgent', () => {
    it('checks the certificate for a host name', () => {
        expect(plexHttpsAgent('https://10-0-0-5.abc123.plex.direct:32400/library')).toBeUndefined();
    });

    // Plex's certificate names *.plex.direct, so an IP address can never pass the check
    it('skips the check for an IPv4 address', () => {
        expect(plexHttpsAgent('https://10.0.0.5:32400/library')?.options.rejectUnauthorized).toBe(false);
    });

    it('skips the check for an IPv6 address', () => {
        expect(plexHttpsAgent('https://[fd00::5]:32400/library')?.options.rejectUnauthorized).toBe(false);
    });
});

describe('getMetadata', () => {
    beforeEach(() => {
        getMock.mockReset();
    });

    it('does not retry a 404, which will answer the same', async () => {
        getMock.mockRejectedValue(answered(404));

        await expect(getMetadata('http://plex.test:32400', 'token', '/library/metadata/1')).rejects.toThrow('404');
        expect(getMock).toHaveBeenCalledTimes(1);
    });

    it('retries once after a server error', async () => {
        getMock.mockRejectedValueOnce(answered(503)).mockResolvedValueOnce({ data: { MediaContainer: { size: 1, Metadata: [{ key: '/library/metadata/1' }] } } });

        await expect(getMetadata('http://plex.test:32400', 'token', '/library/metadata/1')).resolves.toHaveLength(1);
        expect(getMock).toHaveBeenCalledTimes(2);
    });

    it('retries once after a 429', async () => {
        getMock.mockRejectedValueOnce(answered(429)).mockResolvedValueOnce({ data: { MediaContainer: { size: 0, Metadata: [] } } });

        await getMetadata('http://plex.test:32400', 'token', '/library/metadata/1');
        expect(getMock).toHaveBeenCalledTimes(2);
    });
});
