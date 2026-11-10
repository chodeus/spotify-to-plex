import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('../lidarr/utils/musicBrainzGet', () => ({ musicBrainzGet: vi.fn() }));

const { musicBrainzGet } = await import('../lidarr/utils/musicBrainzGet');
const { getReleasesWithoutStatus } = await import('./getReleasesWithoutStatus');

const getMock = musicBrainzGet as unknown as Mock;

describe('getReleasesWithoutStatus', () => {
    beforeEach(() => {
        getMock.mockReset();
    });

    it('lists every release when none has a status', async () => {
        getMock.mockResolvedValue({ data: { releases: [{ id: 'rel-1', status: null }, { id: 'rel-2' }] } });

        expect(await getReleasesWithoutStatus('rg-1')).toEqual(['rel-1', 'rel-2']);
        expect(getMock.mock.calls[0]?.[0]).toBe('https://musicbrainz.org/ws/2/release?release-group=rg-1&fmt=json&limit=100');
    });

    // One release with a status reaches Lidarr, so its empty album is only the metadata lag
    it('lists nothing when any release has a status', async () => {
        getMock.mockResolvedValue({ data: { releases: [{ id: 'rel-1', status: null }, { id: 'rel-2', status: 'Official' }] } });

        expect(await getReleasesWithoutStatus('rg-1')).toEqual([]);
    });

    it('lists nothing for a release group with no releases', async () => {
        getMock.mockResolvedValue({ data: { releases: [] } });

        expect(await getReleasesWithoutStatus('rg-1')).toEqual([]);
    });

    it('answers undefined when MusicBrainz fails', async () => {
        getMock.mockRejectedValue(new Error('503'));

        expect(await getReleasesWithoutStatus('rg-1')).toBeUndefined();
    });
});
