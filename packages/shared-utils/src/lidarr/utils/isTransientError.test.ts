import { AxiosError, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';
import { isTransientError } from './isTransientError';

const answered = (status: number) => new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', undefined, undefined, { status } as AxiosResponse);

describe('isTransientError', () => {
    // Any 5xx, not only 503: a URL lookup that ends on one falls through to a search that can cache a miss
    it('treats every server error, a rate limit and a request timeout as transient', () => {
        for (const status of [500, 502, 503, 504, 429, 408])
            expect(isTransientError(answered(status))).toBe(true);
    });

    it('treats a request that got no answer as transient', () => {
        for (const code of ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNABORTED', 'ECONNRESET'])
            expect(isTransientError(new AxiosError('no answer', code))).toBe(true);
    });

    // A body cut off after the headers: axios keeps the 200 it was reading
    it('treats a connection dropped after the headers as transient', () => {
        expect(isTransientError(new AxiosError('aborted', 'ECONNRESET', undefined, undefined, { status: 200 } as AxiosResponse))).toBe(true);
        expect(isTransientError(new AxiosError('stream has been aborted', 'ERR_BAD_RESPONSE', undefined, undefined, { status: 200 } as AxiosResponse))).toBe(true);
    });

    it('treats an answer as an answer', () => {
        expect(isTransientError(answered(404))).toBe(false);
        expect(isTransientError(answered(400))).toBe(false);
        expect(isTransientError(new Error('not a request'))).toBe(false);
    });
});
