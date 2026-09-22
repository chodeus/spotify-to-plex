import type { SpotifyApi } from '@spotify/web-api-ts-sdk';
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

    it('refuses a full load the scraper flagged as truncated', async () => {
        postMock.mockResolvedValue(scraperResponse(true));

        await expect(getSpotifyData(api, 'spotify:playlist:p', false)).rejects.toThrow(/loaded partially/);
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
