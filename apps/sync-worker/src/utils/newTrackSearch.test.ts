import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// plex-music-search has no test runner; the worker's vitest aliases reach its source
vi.mock('@spotify-to-plex/plex-music-search/utils/searching/searchForTrack', () => ({ searchForTrack: vi.fn() }));

const { searchForTrack } = await import('@spotify-to-plex/plex-music-search/utils/searching/searchForTrack');
const { search } = await import('@spotify-to-plex/plex-music-search/functions/search');
const { analyze } = await import('@spotify-to-plex/plex-music-search/functions/analyze');
const { DEFAULT_MUSIC_SEARCH_CONFIG } = await import('@spotify-to-plex/music-search/config/default-config');

const searchMock = searchForTrack as unknown as Mock;
const config = (searchApproaches: { id: string, filtered?: boolean, trim?: boolean, removeQuotes?: boolean }[]) => ({
    uri: 'http://plex.test:32400',
    token: 'token',
    musicSearchConfig: DEFAULT_MUSIC_SEARCH_CONFIG,
    searchApproaches
});
const track = { id: 'spotify-1', title: 'Don\'t Stop', artists: ['Some Band'], album: 'Album' };

describe('newTrackSearch', () => {
    beforeEach(() => {
        searchMock.mockReset();
    });

    // A Plex timeout used to read as "not in the library", and the track was sent to Lidarr
    it('marks a track as failed when no query reached Plex', async () => {
        searchMock.mockRejectedValue('Could not connect to server');

        const [result] = await search(config([{ id: 'normal' }]), [track]);

        expect(result?.result).toEqual([]);
        expect(result?.failed).toBe(true);
    });

    it('does not mark a track Plex answered with nothing as failed', async () => {
        searchMock.mockResolvedValue([]);

        const [result] = await search(config([{ id: 'normal' }]), [track]);

        expect(result?.failed).toBeUndefined();
    });

    // The settings UI and the default config write removeQuotes, which the search never read
    it('strips quotes for an approach set to remove them', async () => {
        searchMock.mockResolvedValue([]);

        await search(config([{ id: 'filtered', filtered: true, removeQuotes: true }]), [track]);

        expect(searchMock.mock.calls.map(call => call[3])).toContain('dont stop');
    });

    it('lists a query answered from the cache in the analyze view', async () => {
        searchMock.mockResolvedValue([]);

        // Both approaches produce the same strings, so the second is answered from the cache
        const result = await analyze(config([{ id: 'normal' }, { id: 'trimmed', trim: true }]), track);

        expect(result.queries?.map(query => query.approach)).toEqual(['normal', 'trimmed']);
        expect(searchMock).toHaveBeenCalledTimes(1);
    });
});
