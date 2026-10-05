import type { SpotifyApi } from '@spotify/web-api-ts-sdk';
import { describe, expect, it } from 'vitest';
import { getLikedSongs } from './getLikedSongs';

function saved(index: number) {
    return {
        track: {
            id: `track-${index}`,
            name: `Track ${index}`,
            artists: [{ name: 'Artist' }],
            album: { id: 'album-1', name: 'Album' },
            duration_ms: 1000,
            external_ids: { isrc: `XXA00000000${index}` }
        }
    };
}

// Two pages of one track each, so both mappings run
const api = {
    currentUser: {
        tracks: {
            savedTracks: (_limit: number, offset: number) => Promise.resolve(offset === 0
                ? { items: [saved(1)], offset: 0, limit: 1, total: 2, next: 'more' }
                : { items: [saved(2)], offset: 1, limit: 1, total: 2, next: null })
        }
    }
} as unknown as SpotifyApi;

describe('getLikedSongs', () => {
    it('carries the ISRC on every page', async () => {
        const playlist = await getLikedSongs(api, 'user', 'User', false);

        expect(playlist?.tracks.map(track => track.isrc)).toEqual(['XXA000000001', 'XXA000000002']);
    });
});
