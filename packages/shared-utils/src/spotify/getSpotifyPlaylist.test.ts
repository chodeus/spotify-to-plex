import type { SpotifyApi } from '@spotify/web-api-ts-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSpotifyPlaylist } from './getSpotifyPlaylist';

const PAGE = 100;

function item(index: number) {
    return {
        track: {
            id: `track-${index}`,
            name: `Track ${index}`,
            uri: `spotify:track:${index}`,
            artists: [{ name: 'Artist A, Artist B' }],
            album: { id: 'album-1', name: 'Album' },
            duration_ms: 1000 + index
        }
    };
}

function page(total: number, offset: number) {
    const items = Array.from({ length: Math.max(0, Math.min(PAGE, total - offset)) }, (_v, i) => item(offset + i));
    const nextOffset = offset + items.length;
    const next = nextOffset < total ? `https://api.spotify.com/v1/playlists/p/tracks?offset=${nextOffset}&limit=${PAGE}` : null;

    return { total, items, next };
}

function fakeApi(total: number) {
    return {
        getAccessToken: () => Promise.resolve({ access_token: 'token' }),
        playlists: {
            getPlaylist: () => Promise.resolve({
                id: 'p',
                name: 'Playlist',
                owner: { display_name: 'Owner' },
                images: [],
                tracks: page(total, 0)
            })
        }
    } as unknown as SpotifyApi;
}

// Serves the `next` pages; the page at `failAt` answers 500
function stubFetch(total: number, failAt?: number) {
    const offsets: number[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string) => {
        const offset = Number(new URL(url).searchParams.get('offset'));
        offsets.push(offset);
        if (offset === failAt)
            return Promise.resolve({ ok: false, status: 500, statusText: 'Server Error', json: () => Promise.resolve({}) });

        return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(page(total, offset)) });
    }));

    return offsets;
}

describe('getSpotifyPlaylist', () => {

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('follows next through every page and maps them all the same way', async () => {
        const offsets = stubFetch(250);
        const playlist = await getSpotifyPlaylist(fakeApi(250), 'p', false);

        expect(playlist?.tracks).toHaveLength(250);
        expect(playlist?.tracks.at(-1)?.id).toBe('track-249');
        expect(offsets).toEqual([100, 200]);
        // the pages after the first used to keep "Artist A, Artist B" as one name
        expect(playlist?.tracks[0]?.artists).toEqual(['Artist A', 'Artist B']);
        expect(playlist?.tracks[100]?.artists).toEqual(['Artist A', 'Artist B']);
    });

    it('fails rather than returning a partial playlist when a page fetch fails', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => { /* expected */ });
        stubFetch(300, 200);
        const playlist = await getSpotifyPlaylist(fakeApi(300), 'p', false);

        expect(playlist).toBeNull();
    });

    it('stops at the embedded page when simplified', async () => {
        const offsets = stubFetch(250);
        const playlist = await getSpotifyPlaylist(fakeApi(250), 'p', true);

        expect(playlist?.tracks).toHaveLength(100);
        expect(offsets).toEqual([]);
    });

});
