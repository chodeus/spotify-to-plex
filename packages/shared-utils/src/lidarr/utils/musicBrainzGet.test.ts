import { describe, expect, it, vi } from 'vitest';

// Exercise the pacing in isolation: axios is never reached
vi.mock('axios', () => ({ default: { get: vi.fn(async () => ({ data: {} })), isAxiosError: () => false } }));

const { musicBrainzGet } = await import('./musicBrainzGet');

describe('musicBrainzGet pacing', () => {

    it('spaces sequential requests at least a second apart', async () => {
        const at: number[] = [];

        for (let i = 0; i < 3; i++) {
            await musicBrainzGet('https://musicbrainz.org/ws/2/release-group/?query=x');
            at.push(Date.now());
        }

        expect(at[1]! - at[0]!).toBeGreaterThanOrEqual(1000);
        expect(at[2]! - at[1]!).toBeGreaterThanOrEqual(1000);
    }, 20_000);

    // Two callers in flight at once must take consecutive slots, not go together
    it('spaces concurrent requests too', async () => {
        const at: number[] = [];
        const mark = async () => { await musicBrainzGet('https://musicbrainz.org/ws/2/release-group/?query=y'); at.push(Date.now()) };
        await Promise.all([mark(), mark(), mark()]);

        at.sort((a, b) => a - b);
        expect(at[1]! - at[0]!).toBeGreaterThanOrEqual(1000);
        expect(at[2]! - at[1]!).toBeGreaterThanOrEqual(1000);
    }, 20_000);
});
