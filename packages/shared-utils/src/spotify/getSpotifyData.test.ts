import { DefaultResponseValidator, type SpotifyApi } from '@spotify/web-api-ts-sdk';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { getSpotifyData } from './getSpotifyData';

vi.mock('axios', () => ({
    default: { post: vi.fn(), isAxiosError: () => false }
}));

const postMock = axios.post as unknown as Mock;

function scraperTrack(index: number) {
    return {
        id: `track-${index}`,
        uri: `spotify:track:${index}`,
        name: `Track ${index}`,
        artists: [{ name: 'Artist' }],
        album: { name: 'Album' },
        duration_ms: 1000
    };
}

function scraperResponse(truncated: boolean) {
    return {
        data: {
            id: 'p',
            name: 'Playlist',
            owner: { name: 'Owner' },
            images: [],
            track_count: 343,
            tracks: Array.from({ length: 100 }, (_v, i) => scraperTrack(i)),
            truncated
        }
    };
}

// The API refuses the playlist, so getSpotifyData falls through to the scraper
const api = {
    getAccessToken: () => Promise.resolve(null),
    playlists: { getPlaylist: () => Promise.reject(new Error('403')) },
    tracks: { get: () => Promise.resolve([]) }
} as unknown as SpotifyApi;

describe('getSpotifyData scraper fallback', () => {

    beforeEach(() => {
        vi.stubEnv('SPOTIFY_SCRAPER_URL', 'http://scraper');
        vi.spyOn(console, 'error').mockImplementation(() => { /* expected */ });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('says the API returned no tracks when the scraper is not configured', async () => {
        vi.stubEnv('SPOTIFY_SCRAPER_URL', '');

        await expect(getSpotifyData(api, 'spotify:playlist:p', false)).rejects.toThrow("The Spotify API did not return this playlist's tracks, and SpotifyScraper is not configured. Set the SPOTIFY_SCRAPER_URL environment variable.");
    });

    it('refuses a full load the scraper flagged as truncated', async () => {
        postMock.mockResolvedValue(scraperResponse(true));

        await expect(getSpotifyData(api, 'spotify:playlist:p', false)).rejects.toThrow(/loaded partially/);
    });

    // The embed-page fallback reports no total
    it('says the total is unknown when the scraper could not report one', async () => {
        const response = scraperResponse(true);
        postMock.mockResolvedValue({ data: { ...response.data, track_count: null } });

        await expect(getSpotifyData(api, 'spotify:playlist:p', false)).rejects.toThrow('(100 of an unknown number of tracks)');
    });

    it('accepts a full load the scraper did not flag', async () => {
        postMock.mockResolvedValue(scraperResponse(false));
        const playlist = await getSpotifyData(api, 'spotify:playlist:p', false);

        expect(playlist?.tracks).toHaveLength(100);
    });

    it('accepts a capped load, which is short on purpose', async () => {
        postMock.mockResolvedValue(scraperResponse(true));
        const playlist = await getSpotifyData(api, 'spotify:playlist:p', true);

        expect(playlist?.tracks).toHaveLength(100);
    });

});

describe('getSpotifyData enrichment', () => {
    const enriched = { album: { id: 'album-1', name: 'Album' }, duration_ms: 1000, external_ids: { isrc: 'XXA000000001' } };
    const FORBIDDEN_BODY = '{"error": {"status": 403, "message": "Forbidden" } }';

    // The SDK's own validator makes the 403, so a change to its wording fails here
    async function sdkForbidden(body = FORBIDDEN_BODY) {
        return new DefaultResponseValidator()
            .validateResponse(new Response(body, { status: 403 }))
            .then(() => new Error('the SDK accepted a 403'), (error: unknown) => error);
    }

    beforeEach(() => {
        vi.stubEnv('SPOTIFY_SCRAPER_URL', 'http://scraper');
        vi.spyOn(console, 'error').mockImplementation(() => { /* expected */ });
        postMock.mockResolvedValue(scraperResponse(false));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('carries the ISRC from the batch lookup', async () => {
        const batchApi = { ...api, tracks: { get: (ids: string[]) => Promise.resolve(ids.map(() => enriched)) } } as unknown as SpotifyApi;

        const playlist = await getSpotifyData(batchApi, 'spotify:playlist:p', false);

        expect(playlist?.tracks[0]?.isrc).toBe('XXA000000001');
    });

    it('carries the ISRC from the one-by-one lookup a 403 falls back to', async () => {
        vi.useFakeTimers();
        const forbidden = await sdkForbidden();
        const singleApi = {
            ...api,
            tracks: { get: (ids: string[] | string) => (Array.isArray(ids) ? Promise.reject(forbidden) : Promise.resolve(enriched)) }
        } as unknown as SpotifyApi;

        const loading = getSpotifyData(singleApi, 'spotify:playlist:p', false);
        await vi.runAllTimersAsync();
        const playlist = await loading;

        expect(playlist?.tracks[0]?.isrc).toBe('XXA000000001');
    });

    it.each([['Spotify\'s body', FORBIDDEN_BODY], ['an empty body', '']])('asks the batch endpoint once when it answers 403 with %s, and says so in one plain line', async (_name, body) => {
        vi.useFakeTimers();
        const log = vi.spyOn(console, 'log').mockImplementation(() => { /* expected */ });
        const forbidden = await sdkForbidden(body);
        const batchCalls: string[][] = [];
        const singleApi = {
            ...api,
            tracks: { get: (ids: string[] | string) => {
                if (!Array.isArray(ids))
                    return Promise.resolve(enriched);

                batchCalls.push(ids);

                return Promise.reject(forbidden);
            } }
        } as unknown as SpotifyApi;

        // 100 tracks: two batches of 50
        const loading = getSpotifyData(singleApi, 'spotify:playlist:p', false);
        await vi.runAllTimersAsync();
        const playlist = await loading;

        expect(batchCalls).toHaveLength(1);
        expect(playlist?.tracks.map(track => track.isrc)).toEqual(Array.from({ length: 100 }, () => 'XXA000000001'));
        expect(log.mock.calls.filter(([line]) => String(line).includes('batch track lookup'))).toHaveLength(1);
        expect(vi.mocked(console.error).mock.calls.filter(([line]) => String(line).includes('enrich'))).toEqual([]);
    });


    it('says how many one-by-one lookups failed, in one error per batch', async () => {
        vi.useFakeTimers();
        vi.spyOn(console, 'log').mockImplementation(() => { /* expected */ });
        const forbidden = await sdkForbidden();
        let single = 0;
        const failingApi = {
            ...api,
            tracks: { get: (ids: string[] | string) => {
                if (Array.isArray(ids))
                    return Promise.reject(forbidden);

                single++;

                return single % 2 ? Promise.reject(new Error('Bad or expired token.')) : Promise.resolve(enriched);
            } }
        } as unknown as SpotifyApi;

        const loading = getSpotifyData(failingApi, 'spotify:playlist:p', false);
        await vi.runAllTimersAsync();
        const playlist = await loading;

        expect(playlist?.tracks.filter(track => track.isrc)).toHaveLength(50);
        expect(vi.mocked(console.error).mock.calls.filter(([line]) => String(line).includes('single-track'))).toEqual([
            ["❌ 25 single-track lookups failed, so those tracks keep the scraper's data with no ISRC: Bad or expired token."],
            ["❌ 25 single-track lookups failed, so those tracks keep the scraper's data with no ISRC: Bad or expired token."]
        ]);
    });

});
