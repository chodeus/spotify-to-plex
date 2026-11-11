import type { SpotifyApi } from '@spotify/web-api-ts-sdk';
import { describe, expect, it, vi } from 'vitest';
import { getSpotifyData } from './getSpotifyData';

const track = (index: number) => ({
    id: `track-${index}`,
    name: `Track ${index}`,
    artists: [{ name: 'Artist' }],
    duration_ms: 1000
});

// Spotify's album answer holds the first 50 tracks; the rest come from the album tracks endpoint
function albumApi(total: number, failAt?: number, emptyAt?: number) {
    const all = Array.from({ length: total }, (_v, i) => track(i));
    const tracks = vi.fn(async (_id: string, _market: unknown, limit: number, offset: number) => {
        if (offset === failAt)
            throw new Error('502 Bad Gateway');

        return { items: offset === emptyAt ? [] : all.slice(offset, offset + limit), total };
    });
    const api = {
        albums: {
            get: async () => ({
                id: 'album',
                name: 'Album',
                images: [],
                artists: [{ name: 'Artist' }],
                tracks: { items: all.slice(0, 50), total }
            }),
            tracks
        }
    } as unknown as SpotifyApi;

    return { api, tracks };
}

describe('getSpotifyData album', () => {
    it('loads every track of an album longer than 50', async () => {
        const { api, tracks } = albumApi(120);

        const album = await getSpotifyData(api, 'spotify:album:album');

        expect(album?.tracks).toHaveLength(120);
        expect(album?.tracks.at(-1)?.id).toBe('track-119');
        expect(tracks.mock.calls.map(call => call[3])).toEqual([50, 100]);
    });

    it('makes no extra request for an album of 50 or fewer', async () => {
        const { api, tracks } = albumApi(12);

        const album = await getSpotifyData(api, 'spotify:album:album');

        expect(album?.tracks).toHaveLength(12);
        expect(tracks).not.toHaveBeenCalled();
    });

    // Syncing part of the album would shrink its Plex playlist
    it('fails the album rather than returning part of it', async () => {
        const { api } = albumApi(120, 100);

        await expect(getSpotifyData(api, 'spotify:album:album')).resolves.toBeNull();
    });

    it('fails the album when a page comes back empty short of the total', async () => {
        const { api } = albumApi(120, undefined, 100);

        await expect(getSpotifyData(api, 'spotify:album:album')).resolves.toBeNull();
    });
});
