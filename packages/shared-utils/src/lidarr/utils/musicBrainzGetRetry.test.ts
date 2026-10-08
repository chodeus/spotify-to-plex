import axios, { AxiosError, type AxiosResponse } from 'axios';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';

// Real axios errors, so the retry fires; only the request itself is faked
vi.mock('axios', async importOriginal => {
    const actual = await importOriginal<typeof import('axios')>();

    return { ...actual, default: { ...actual.default, get: vi.fn() } };
});

const { musicBrainzGet } = await import('./musicBrainzGet');
const getMock = axios.get as unknown as Mock;

describe('musicBrainzGet retry', () => {
    afterEach(() => vi.useRealTimers());

    // A retry fired outside the pacing, so the next request went out right behind it and drew another 503
    it('keeps a retry and the next request a full interval apart', async () => {
        vi.useFakeTimers();
        const sentAt: number[] = [];
        getMock.mockImplementation(() => {
            sentAt.push(Date.now());

            if (sentAt.length === 1)
                return Promise.reject(new AxiosError('busy', 'ERR_BAD_RESPONSE', undefined, undefined, { status: 503 } as AxiosResponse));

            return Promise.resolve({ data: {} });
        });

        const first = musicBrainzGet('https://musicbrainz.org/ws/2/a');
        // Just the retry's own delay, so the next call starts the moment the retry is done
        await vi.advanceTimersByTimeAsync(2000);
        await first;
        const second = musicBrainzGet('https://musicbrainz.org/ws/2/b');
        await vi.advanceTimersByTimeAsync(2000);
        await second;

        expect(sentAt).toHaveLength(3);
        expect(sentAt[2]! - sentAt[1]!).toBeGreaterThanOrEqual(1100);
    });

    // The queued request had claimed its slot before the 503 arrived
    it('holds the retry and a queued request for the wait Retry-After names', async () => {
        vi.useFakeTimers();
        const sentAt: number[] = [];
        getMock.mockImplementation(() => {
            sentAt.push(Date.now());

            if (sentAt.length === 1)
                return Promise.reject(new AxiosError('busy', 'ERR_BAD_RESPONSE', undefined, undefined, { status: 503, headers: { 'retry-after': '5' } } as unknown as AxiosResponse));

            return Promise.resolve({ data: {} });
        });

        const first = musicBrainzGet('https://musicbrainz.org/ws/2/a');
        const queued = musicBrainzGet('https://musicbrainz.org/ws/2/b');
        await vi.advanceTimersByTimeAsync(60_000);
        await Promise.all([first, queued]);

        expect(sentAt).toHaveLength(3);
        expect(Math.min(sentAt[1]!, sentAt[2]!) - sentAt[0]!).toBeGreaterThanOrEqual(5000);
    });
});
