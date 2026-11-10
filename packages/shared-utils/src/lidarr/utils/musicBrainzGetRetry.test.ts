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

    // The pacing interval is 1100 ms, retries included
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

    it('retries a busy MusicBrainz three times, each wait twice the last, then gives up', async () => {
        vi.useFakeTimers();
        const busy = () => Promise.reject(new AxiosError('busy', 'ERR_BAD_RESPONSE', undefined, undefined, { status: 503 } as AxiosResponse));

        // Busy three times, then answers: the fourth try gets through
        const sentAt: number[] = [];
        getMock.mockImplementation(() => {
            sentAt.push(Date.now());

            return sentAt.length <= 3 ? busy() : Promise.resolve({ data: { ok: true } });
        });
        const answered = musicBrainzGet('https://musicbrainz.org/ws/2/a');
        await vi.advanceTimersByTimeAsync(30_000);
        await expect(answered).resolves.toMatchObject({ data: { ok: true } });
        expect(sentAt).toHaveLength(4);
        expect(sentAt[1]! - sentAt[0]!).toBeGreaterThanOrEqual(2000);
        expect(sentAt[2]! - sentAt[1]!).toBeGreaterThanOrEqual(4000);
        expect(sentAt[3]! - sentAt[2]!).toBeGreaterThanOrEqual(8000);

        // Busy every time: four tries, then the 503 is the caller's
        getMock.mockReset();
        getMock.mockImplementation(busy);
        const refused = musicBrainzGet('https://musicbrainz.org/ws/2/b');
        const settled = refused.catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(30_000);
        expect(await settled).toBeInstanceOf(AxiosError);
        expect(getMock).toHaveBeenCalledTimes(4);
    });

    // Each try already waited out the request timeout, and a manual send waits on all of them
    it('retries a request that got no answer only once', async () => {
        vi.useFakeTimers();
        getMock.mockImplementation(() => Promise.reject(new AxiosError('timeout of 20000ms exceeded', 'ECONNABORTED')));

        const settled = musicBrainzGet('https://musicbrainz.org/ws/2/a').catch((error: unknown) => error);
        // Well past the pacing slot the earlier cases' fake clocks left claimed
        await vi.advanceTimersByTimeAsync(300_000);

        expect(await settled).toBeInstanceOf(AxiosError);
        expect(getMock).toHaveBeenCalledTimes(2);
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
