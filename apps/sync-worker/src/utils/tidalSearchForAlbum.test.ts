import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// tidal-music-search has no test runner, and no alias in this worker's vitest config, so reach its source by path
vi.mock('../../../../packages/tidal-music-search/src/utils/tidal/searchAlbum', () => ({ searchAlbum: vi.fn() }));

const { searchAlbum } = await import('../../../../packages/tidal-music-search/src/utils/tidal/searchAlbum');
const { searchForAlbum } = await import('../../../../packages/tidal-music-search/src/utils/searchForAlbum');

const searchMock = searchAlbum as unknown as Mock;

describe('Tidal searchForAlbum', () => {
    beforeEach(() => {
        searchMock.mockReset();
    });

    it("drops an album by another artist that shares the title", async () => {
        searchMock.mockResolvedValue([
            { id: '1', title: 'Greatest Hits', artists: ['Someone Else Entirely'] },
            { id: '2', title: 'Greatest Hits', artists: ['The Band'] }
        ]);

        const albums = await searchForAlbum('The Band', 'Greatest Hits');

        expect(albums.map(album => album.id)).toEqual(['2']);
    });
});
