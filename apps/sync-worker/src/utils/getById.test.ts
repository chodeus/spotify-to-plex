import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { PlexMusicSearchConfig } from '@spotify-to-plex/plex-music-search/types/PlexMusicSearchConfig';

// plex-music-search has no test runner; the worker's vitest aliases reach its source
vi.mock('@spotify-to-plex/plex-music-search/actions/getMetadata', () => ({ getMetadata: vi.fn() }));

const { getMetadata } = await import('@spotify-to-plex/plex-music-search/actions/getMetadata');
const { getById } = await import('@spotify-to-plex/plex-music-search/functions/getById');
const { PlexItemMissingError } = await import('@spotify-to-plex/plex-music-search/utils/PlexItemMissingError');

const getMetadataMock = getMetadata as unknown as Mock;
const config = { uri: 'http://plex.test:32400', token: 'token' } as PlexMusicSearchConfig;

describe('getById', () => {
    beforeEach(() => {
        getMetadataMock.mockReset();
    });

    it('reports an item Plex answers 404 for as missing', async () => {
        getMetadataMock.mockRejectedValue(Object.assign(new Error('Request failed with status code 404'), { response: { status: 404 } }));

        await expect(getById(config, '/library/metadata/1')).rejects.toBeInstanceOf(PlexItemMissingError);
    });

    it('reports an empty answer as missing', async () => {
        getMetadataMock.mockResolvedValue([]);

        await expect(getById(config, '/library/metadata/1')).rejects.toBeInstanceOf(PlexItemMissingError);
    });

    it('passes any other failure through', async () => {
        getMetadataMock.mockRejectedValue(Object.assign(new Error('Request failed with status code 401'), { response: { status: 401 } }));

        await expect(getById(config, '/library/metadata/1')).rejects.not.toBeInstanceOf(PlexItemMissingError);
    });
});
