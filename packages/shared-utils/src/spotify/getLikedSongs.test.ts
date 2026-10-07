import type { SpotifyApi } from '@spotify/web-api-ts-sdk';
import { describe, expect, it } from 'vitest';
import { getLikedSongs } from './getLikedSongs';

function saved(index: number, artist: string) {
    return {
        track: {
            id: `track-${index}`,
            name: `Track ${index}`,
            artists: [{ name: artist }],
            album: { id: 'album-1', name: 'Album' },
            duration_ms: 1000,
            external_ids: { isrc: `XXA00000000${index}` }
        }
    };
}

// Two pages of one track each, so both pages are mapped
function twoPages(artist = 'Artist') {
    return {
        currentUser: {
            tracks: {
                savedTracks: (_limit: number, offset: number) => {
                    if (offset === 0)
                        return Promise.resolve({ items: [saved(1, artist)], offset: 0, limit: 1, total: 2, next: 'more' });

                    return Promise.resolve({ items: [saved(2, artist)], offset: 1, limit: 1, total: 2, next: null });
                }
            }
        }
    } as unknown as SpotifyApi;
}

describe('getLikedSongs', () => {
    it('carries the ISRC on every page', async () => {
        const playlist = await getLikedSongs(twoPages(), 'user', 'User', false);

        expect(playlist?.tracks.map(track => track.isrc)).toEqual(['XXA000000001', 'XXA000000002']);
    });

    // Page 2 kept "A, B" as one artist while page 1 split it
    it('splits a comma-joined artist the same way on every page', async () => {
        const playlist = await getLikedSongs(twoPages('Some Band, Other Band'), 'user', 'User', false);

        expect(playlist?.tracks.map(track => track.artists)).toEqual([['Some Band', 'Other Band'], ['Some Band', 'Other Band']]);
    });
});
