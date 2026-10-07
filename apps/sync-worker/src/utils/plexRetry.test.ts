import { afterEach, describe, expect, it, vi } from 'vitest';
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
            vi.spyOn(console, 'error').mockImplementation(() => {});

            await expect(handleOneRetryAttempt(request, { retryDelay: 0 })).resolves.toEqual({ data: 'ok' });
            expect(request).toHaveBeenCalledTimes(2);
        }
    });

    // The retry log went to docker logs with the whole axios error, token included
    it('never logs the Plex token', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        const request = vi.fn().mockRejectedValueOnce(axiosError(500))
            .mockResolvedValueOnce({ data: 'ok' });

        await handleOneRetryAttempt(request, { retryDelay: 0 });

        expect(log).toHaveBeenCalled();
        expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN);
    });
});
