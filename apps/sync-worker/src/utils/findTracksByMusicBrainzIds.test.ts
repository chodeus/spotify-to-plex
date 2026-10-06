import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { PlexMusicSearchConfig } from '@spotify-to-plex/plex-music-search/types/PlexMusicSearchConfig';

// plex-music-search has no test runner; the worker's vitest aliases reach its source
vi.mock('@spotify-to-plex/plex-music-search/actions/hubSearch', () => ({ default: vi.fn() }));
vi.mock('@spotify-to-plex/plex-music-search/actions/getMetadata', () => ({ getMetadata: vi.fn() }));

const { default: hubSearch } = await import('@spotify-to-plex/plex-music-search/actions/hubSearch');
const { getMetadata } = await import('@spotify-to-plex/plex-music-search/actions/getMetadata');
const { findTracksByMusicBrainzIds } = await import('@spotify-to-plex/plex-music-search/functions/findTracksByMusicBrainzIds');

const hubSearchMock = hubSearch as unknown as Mock;
const getMetadataMock = getMetadata as unknown as Mock;
const config = { uri: 'http://plex.test:32400', token: 'token' } as PlexMusicSearchConfig;

const compilation = {
    type: 'album', id: '/library/metadata/100/children', ratingKey: '100', guid: 'plex://album/100', score: 1, image: '', year: 2004,
    title: 'Hits Compilation', artist: { guid: '', id: '', title: 'Various Artists', alternative_title: '', image: '' }
};

const trackOnCompilation = {
    key: '/library/metadata/101', ratingKey: '101', guid: 'plex://track/101', title: 'Song', duration: 200_000,
    parentKey: '/library/metadata/100', parentTitle: 'Hits Compilation', grandparentTitle: 'Various Artists', originalTitle: 'Some Band',
    Guid: [{ id: 'mbid://track-a' }]
};

describe('findTracksByMusicBrainzIds', () => {
    beforeEach(() => {
        hubSearchMock.mockReset();
        getMetadataMock.mockReset();
        hubSearchMock.mockResolvedValue([compilation]);
        getMetadataMock.mockResolvedValue([trackOnCompilation]);
    });

    it('finds the track on a Various Artists album when any album artist is allowed', async () => {
        const hits = await findTracksByMusicBrainzIds(config, 'Some Band', 'Hits Compilation', ['track-a'], { similarity: 0, contain: false });

        expect(hits.map(hit => hit.id)).toEqual(['/library/metadata/101']);
    });

    it('skips a Various Artists album under the default artist rule', async () => {
        const hits = await findTracksByMusicBrainzIds(config, 'Some Band', 'Hits Compilation', ['track-a']);

        expect(hits).toEqual([]);
        expect(getMetadataMock).not.toHaveBeenCalled();
    });

    it('ignores a track whose guid is not one of the ids', async () => {
        const hits = await findTracksByMusicBrainzIds(config, 'Some Band', 'Hits Compilation', ['track-b'], { similarity: 0, contain: false });

        expect(hits).toEqual([]);
    });
});
