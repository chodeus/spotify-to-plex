import axios from 'axios';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { monitorAndSearchAlbum } from './monitorAndSearchAlbum';

vi.mock('axios', () => ({
    default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), isAxiosError: () => false }
}));

const getMock = axios.get as unknown as Mock;
const postMock = axios.post as unknown as Mock;
const putMock = axios.put as unknown as Mock;

function lidarrHas(album: object) {
    getMock.mockResolvedValue({ data: [{ id: 7, foreignAlbumId: 'rg-1', title: 'Album', monitored: true, artistId: 1, ...album }] });
}

const searched = () => postMock.mock.calls.some(([, body]) => body?.name === 'AlbumSearch');

describe('monitorAndSearchAlbum', () => {
    beforeEach(() => {
        getMock.mockReset();
        postMock.mockReset();
        putMock.mockReset();
        postMock.mockResolvedValue({ data: {} });
    });

    it('does not search an album Lidarr already holds every track of', async () => {
        lidarrHas({ statistics: { trackFileCount: 4, totalTrackCount: 4 } });

        const outcome = await monitorAndSearchAlbum('rg-1', 'http://lidarr:8686', 'key');

        expect(searched()).toBe(false);
        expect(outcome).toEqual({ success: true, message: 'Album complete in Lidarr, not searched' });
    });

    it('searches an album with tracks missing', async () => {
        lidarrHas({ statistics: { trackFileCount: 3, totalTrackCount: 4 } });

        await monitorAndSearchAlbum('rg-1', 'http://lidarr:8686', 'key');

        expect(searched()).toBe(true);
    });

    // Lidarr's trackCount leaves out an unmonitored album's tracks that have no file
    it('monitors and searches an unmonitored album with tracks missing', async () => {
        lidarrHas({ monitored: false, statistics: { trackFileCount: 3, trackCount: 3, totalTrackCount: 12 } });

        await monitorAndSearchAlbum('rg-1', 'http://lidarr:8686', 'key');

        expect(putMock.mock.calls[0]?.[1]).toMatchObject({ monitored: true });
        expect(searched()).toBe(true);
    });

    // 0 of 0 is not "complete" - it is an album Lidarr has no release tracks for yet
    it('searches an album with no tracks', async () => {
        lidarrHas({ statistics: { trackFileCount: 0, totalTrackCount: 0 } });

        await monitorAndSearchAlbum('rg-1', 'http://lidarr:8686', 'key');

        expect(searched()).toBe(true);
    });

    it('searches as before when Lidarr sends no statistics', async () => {
        lidarrHas({});

        await monitorAndSearchAlbum('rg-1', 'http://lidarr:8686', 'key');

        expect(searched()).toBe(true);
    });

    // A Lidarr that was down used to read as an album it does not have
    it('reports an unreachable Lidarr as the error it is', async () => {
        getMock.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:8686'));

        const outcome = await monitorAndSearchAlbum('rg-1', 'http://lidarr:8686', 'key');

        expect(outcome.success).toBe(false);
        expect(outcome.message).toContain('ECONNREFUSED');
        expect(outcome.message).not.toContain('not found');
    });
});
