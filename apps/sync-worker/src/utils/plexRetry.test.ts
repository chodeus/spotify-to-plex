import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeHttpError } from '@spotify-to-plex/http-client/describeHttpError';
import { retryAfterMs } from '@spotify-to-plex/http-client/retryAfterMs';
import { handleOneRetryAttempt } from '@spotify-to-plex/plex-helpers/retry';

const TOKEN = 'fake-plex-token';

function axiosError(status?: number) {
    return Object.assign(new Error(status ? `Request failed with status code ${status}` : 'connect ECONNREFUSED'), {
        config: { headers: { 'X-Plex-Token': TOKEN } },
        response: status ? { status } : undefined
    });
}

describe('handleOneRetryAttempt', () => {
    afterEach(() => vi.restoreAllMocks());

    it('throws a 4xx at once instead of retrying it', async () => {
        const request = vi.fn().mockRejectedValue(axiosError(404));

        await expect(handleOneRetryAttempt(request, { retryDelay: 0 })).rejects.toMatchObject({ response: { status: 404 } });
        expect(request).toHaveBeenCalledTimes(1);
    });

    it('retries a 5xx, a 429 and a request with no answer once', async () => {
        for (const error of [axiosError(500), axiosError(429), axiosError()]) {
            const request = vi.fn().mockRejectedValueOnce(error)
                .mockResolvedValueOnce({ data: 'ok' });
            vi.spyOn(console, 'error').mockImplementation(() => { /* expected */ });

            await expect(handleOneRetryAttempt(request, { retryDelay: 0 })).resolves.toEqual({ data: 'ok' });
            expect(request).toHaveBeenCalledTimes(2);
        }
    });

    // The retry log went to docker logs with the whole axios error, token included
    it('never logs the Plex token', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => { /* expected */ });
        const request = vi.fn().mockRejectedValueOnce(axiosError(500))
            .mockResolvedValueOnce({ data: 'ok' });

        await handleOneRetryAttempt(request, { retryDelay: 0 });

        expect(log).toHaveBeenCalled();
        expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN);
    });
});

describe('retryAfterMs', () => {
    const limited = (status: number, retryAfter?: string) => Object.assign(axiosError(status), { response: { status, headers: retryAfter === undefined ? {} : { 'retry-after': retryAfter } } });

    it('reads delay-seconds and an HTTP date from a 429 or 5xx', () => {
        expect(retryAfterMs(limited(429, '3'))).toBe(3000);
        expect(retryAfterMs(limited(503, new Date(Date.now() + 10_000).toUTCString()))).toBeGreaterThan(8000);
    });

    it('names no wait without the header, for a blank one, or for a 4xx that is not a 429', () => {
        expect(retryAfterMs(limited(503))).toBeUndefined();
        expect(retryAfterMs(limited(503, ' '))).toBeUndefined();
        expect(retryAfterMs(limited(404, '3'))).toBeUndefined();
        expect(retryAfterMs(axiosError())).toBeUndefined();
    });

    it('caps a wait that would stall the run', () => {
        expect(retryAfterMs(limited(429, '86400'))).toBe(60_000);
    });

    // A fixed 60s retryDelay would time the test out; Plex's 0s Retry-After must win
    it('waits for Retry-After instead of the fixed delay', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => { /* expected */ });
        const request = vi.fn().mockRejectedValueOnce(limited(429, '0'))
            .mockResolvedValueOnce({ data: 'ok' });

        await expect(handleOneRetryAttempt(request, { retryDelay: 60_000 })).resolves.toEqual({ data: 'ok' });
    });
});

describe('describeHttpError', () => {
    it('gives the status of an answered request and the message of an unanswered one', () => {
        expect(describeHttpError(axiosError(404))).toBe('HTTP 404');
        expect(describeHttpError(axiosError())).toBe('connect ECONNREFUSED');
        expect(describeHttpError('not an error')).toBe('no response');
    });

    it('never includes the token the request carried', () => {
        expect([axiosError(500), axiosError()].map(error => describeHttpError(error)).join(' ')).not.toContain(TOKEN);
    });
});
