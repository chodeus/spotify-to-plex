import { AxiosError, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';
import { isTransientError } from './isTransientError';

const answered = (status: number) => new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', undefined, undefined, { status } as AxiosResponse);

describe('isTransientError', () => {
    // A 500, 502 or 504 used to end the lookup, and a URL lookup then cached the album as a permanent miss
    it('treats every server error and a rate limit as transient', () => {
        for (const status of [500, 502, 503, 504, 429])
            expect(isTransientError(answered(status))).toBe(true);
    });

    it('treats a request that got no answer as transient', () => {
        for (const code of ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNABORTED', 'ECONNRESET'])
            expect(isTransientError(new AxiosError('no answer', code))).toBe(true);
    });

    it('treats an answer as an answer', () => {
        expect(isTransientError(answered(404))).toBe(false);
        expect(isTransientError(answered(400))).toBe(false);
        expect(isTransientError(new Error('not a request'))).toBe(false);
    });
});
