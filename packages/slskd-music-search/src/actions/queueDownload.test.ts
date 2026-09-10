import { describe, expect, it } from 'vitest';
import { AxiosError } from 'axios';
import { classifyQueueError } from './queueDownload';

// slskd reports why a queue attempt failed in the response body, and what the
// loop should do next depends entirely on which kind it is: give up on this
// source, treat it as already done, or back off and retry.
const slskdError = (data: unknown) => {
    const error = new AxiosError('Request failed');
    // @ts-expect-error - only the response body matters to the classifier
    error.response = { status: 500, data };

    return error;
};

describe('classifyQueueError', () => {

    it('treats a duplicate transfer as already queued', () => {
        expect(classifyQueueError(slskdError('Transfer already in progress'))).toBe('already-queued');
        expect(classifyQueueError(slskdError({ message: 'DuplicateTransferException' }))).toBe('already-queued');
    });

    it('moves to the next source for errors that will not improve on retry', () => {
        for (const body of ['File not shared', 'Transfer rejected', 'User is offline', 'access denied'])
            expect(classifyQueueError(slskdError(body))).toBe('try-next-source');
    });

    it('matches those regardless of case, and inside a JSON body', () => {
        expect(classifyQueueError(slskdError('FILE NOT FOUND'))).toBe('try-next-source');
        expect(classifyQueueError(slskdError({ error: 'user is not online' }))).toBe('try-next-source');
    });

    it('retries anything else', () => {
        expect(classifyQueueError(slskdError('Internal server error'))).toBe('retry');
        expect(classifyQueueError(slskdError(undefined))).toBe('retry');
    });

    // A network drop or a thrown TypeError is not slskd telling us anything
    it('retries a non-HTTP failure', () => {
        expect(classifyQueueError(new Error('socket hang up'))).toBe('retry');
        expect(classifyQueueError('not an error at all')).toBe('retry');
    });
});
