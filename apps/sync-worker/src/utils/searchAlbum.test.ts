import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { PlexMusicSearchConfig } from '@spotify-to-plex/plex-music-search/types/PlexMusicSearchConfig';

// plex-music-search has no test runner; the worker's vitest aliases reach its source
vi.mock('@spotify-to-plex/plex-music-search/utils/searching/searchForAlbum', () => ({ searchForAlbum: vi.fn() }));
vi.mock('@spotify-to-plex/plex-music-search/actions/getAlbumTracks', () => ({ default: vi.fn() }));

const { searchForAlbum } = await import('@spotify-to-plex/plex-music-search/utils/searching/searchForAlbum');
const { default: getAlbumTracks } = await import('@spotify-to-plex/plex-music-search/actions/getAlbumTracks');
const { searchAlbum } = await import('@spotify-to-plex/plex-music-search/functions/searchAlbum');

const albumMock = searchForAlbum as unknown as Mock;
const tracksMock = getAlbumTracks as unknown as Mock;

// The duration-guarded row the fork's README recommends
const config = {
    uri: 'http://plex.test:32400',
    token: 'token',
    searchApproaches: [{ id: 'normal' }],
    musicSearchConfig: {
        matchFilters: ['artist:match AND title:match AND duration:similarity>=0.65'],
        textProcessing: { filterOutWords: [], filterOutQuotes: [], cutOffSeparators: [] },
        searchApproaches: [{ id: 'normal' }],
        options: { enableCaching: false, maxCacheSize: 0, debugMode: false }
    }
} as unknown as PlexMusicSearchConfig;

function albumTrack(id: string, title: string, durationMs: number) {
    return {
        type: 'track', id, ratingKey: id, guid: `plex://track/${id}`, score: 1, image: '', title, duration_ms: durationMs,
        album: { id: 'album', guid: '', title: 'Album', year: 2000, image: '' },
        artist: { id: 'artist', guid: '', title: 'Artist', image: '' }
    };
}

describe('searchAlbum', () => {
    beforeEach(() => {
        albumMock.mockReset();
        tracksMock.mockReset();
        albumMock.mockResolvedValue([{ id: '/library/metadata/100/children', title: 'Album' }]);
    });

    it('matches album tracks under a duration-guarded filter', async () => {
        tracksMock.mockResolvedValue([albumTrack('/library/metadata/101', 'Song', 200_000)]);

        const [result] = await searchAlbum(config, [{ id: 'spotify-1', title: 'Song', artists: ['Artist'], album: 'Album', duration_ms: 201_000 }]);

        expect(result?.result.map(track => track.id)).toEqual(['/library/metadata/101']);
    });

    it('still rejects an album track of a different length', async () => {
        tracksMock.mockResolvedValue([albumTrack('/library/metadata/101', 'Song', 520_000)]);

        const [result] = await searchAlbum(config, [{ id: 'spotify-1', title: 'Song', artists: ['Artist'], album: 'Album', duration_ms: 201_000 }]);

        expect(result?.result).toEqual([]);
    });
});
