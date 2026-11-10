import { AxiosError, type AxiosResponse } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Real axios errors, so the retry fires; only the request itself is faked
const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock('axios', async importOriginal => {
    const actual = await importOriginal<typeof import('axios')>();

    return { ...actual, default: { ...actual.default, get: getMock } };
});

// The module keeps pacing and outage state; each test gets its own copy, as each starts its own fake clock
let musicBrainzGet: typeof import('./musicBrainzGet').musicBrainzGet;

describe('musicBrainzGet retry', () => {
    beforeEach(async () => {
        vi.resetModules();
        getMock.mockReset();
        ({ musicBrainzGet } = await import('./musicBrainzGet'));
    });

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
        await vi.advanceTimersByTimeAsync(30_000);

        expect(await settled).toBeInstanceOf(AxiosError);
        expect(getMock).toHaveBeenCalledTimes(2);
    });

    // A 404 is an answer, not an outage
    it('keeps asking after a failure that is not transient', async () => {
        vi.useFakeTimers();
        getMock.mockRejectedValueOnce(new AxiosError('not found', 'ERR_BAD_REQUEST', undefined, undefined, { status: 404 } as AxiosResponse));
        const missing = musicBrainzGet('https://musicbrainz.org/ws/2/a').catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(2000);
        expect(await missing).toBeInstanceOf(AxiosError);

        getMock.mockResolvedValueOnce({ data: { ok: true } });
        const next = musicBrainzGet('https://musicbrainz.org/ws/2/b');
        await vi.advanceTimersByTimeAsync(2000);
        await expect(next).resolves.toMatchObject({ data: { ok: true } });
        expect(getMock).toHaveBeenCalledTimes(2);
    });

    // Else a run pays every retry again on each album while MusicBrainz is down
    it('fails at once for two minutes after a call spends every retry, then asks again', async () => {
        vi.useFakeTimers();
        getMock.mockImplementation(() => Promise.reject(new AxiosError('busy', 'ERR_BAD_RESPONSE', undefined, undefined, { status: 503 } as AxiosResponse)));
        const refused = musicBrainzGet('https://musicbrainz.org/ws/2/a').catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(30_000);
        expect(await refused).toBeInstanceOf(AxiosError);

        // The same transient error, so callers still answer "unavailable"
        await expect(musicBrainzGet('https://musicbrainz.org/ws/2/b')).rejects.toBeInstanceOf(AxiosError);
        expect(getMock).toHaveBeenCalledTimes(4);

        getMock.mockReset();
        getMock.mockResolvedValue({ data: { ok: true } });
        await vi.advanceTimersByTimeAsync(2 * 60_000);
        const back = musicBrainzGet('https://musicbrainz.org/ws/2/c');
        await vi.advanceTimersByTimeAsync(2000);
        await expect(back).resolves.toMatchObject({ data: { ok: true } });
        expect(getMock).toHaveBeenCalledTimes(1);
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
