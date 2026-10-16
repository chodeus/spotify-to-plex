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

    describe("pinning Spotify's release", () => {
        const releases = [{ id: 1, foreignReleaseId: 'rel-extended', monitored: true }, { id: 2, foreignReleaseId: 'rel-spotify', monitored: false }];
        const empty = { anyReleaseOk: true, releases, statistics: { trackFileCount: 0, totalTrackCount: 1 } };
        const order = () => [...putMock.mock.invocationCallOrder.map(n => [n, 'put']), ...postMock.mock.invocationCallOrder.map(n => [n, 'post'])]
            .sort(([a], [b]) => Number(a) - Number(b)).map(([, call]) => call);

        it('selects it on an empty album and turns any-release-ok off, before searching', async () => {
            lidarrHas(empty);

            const outcome = await monitorAndSearchAlbum('rg-1', 'http://lidarr:8686', 'key', 'rel-spotify');

            expect(putMock.mock.calls[0]?.[1]).toMatchObject({
                monitored: true,
                anyReleaseOk: false,
                releases: [{ id: 1, monitored: false }, { id: 2, monitored: true }]
            });
            expect(order()).toEqual(['put', 'post']);
            expect(outcome.message).toBe("Album already monitored, Spotify's release selected, search triggered");
        });

        it('monitors and pins an unmonitored empty album in one update', async () => {
            lidarrHas({ ...empty, monitored: false });

            await monitorAndSearchAlbum('rg-1', 'http://lidarr:8686', 'key', 'rel-spotify');

            expect(putMock).toHaveBeenCalledTimes(1);
            expect(putMock.mock.calls[0]?.[1]).toMatchObject({ monitored: true, anyReleaseOk: false });
        });

        // Switching the release would drop Lidarr's links to the files it already has
        it('leaves an album with files on its release', async () => {
            lidarrHas({ ...empty, statistics: { trackFileCount: 1, totalTrackCount: 2 } });

            await monitorAndSearchAlbum('rg-1', 'http://lidarr:8686', 'key', 'rel-spotify');

            expect(putMock).not.toHaveBeenCalled();
            expect(searched()).toBe(true);
        });

        it('leaves an album alone when Lidarr sends no statistics', async () => {
            lidarrHas({ anyReleaseOk: true, releases });

            await monitorAndSearchAlbum('rg-1', 'http://lidarr:8686', 'key', 'rel-spotify');

            expect(putMock).not.toHaveBeenCalled();
        });

        it("says so when Spotify's release is not in Lidarr's list, and still searches", async () => {
            lidarrHas(empty);

            const outcome = await monitorAndSearchAlbum('rg-1', 'http://lidarr:8686', 'key', 'rel-elsewhere');

            expect(putMock).not.toHaveBeenCalled();
            expect(searched()).toBe(true);
            expect(outcome.message).toBe("Album already monitored, Spotify's release is not in Lidarr's list, search triggered");
        });

        it('does not update an album already pinned to it', async () => {
            lidarrHas({ ...empty, anyReleaseOk: false, releases: releases.map(r => ({ ...r, monitored: r.id === 2 })) });

            await monitorAndSearchAlbum('rg-1', 'http://lidarr:8686', 'key', 'rel-spotify');

            expect(putMock).not.toHaveBeenCalled();
            expect(searched()).toBe(true);
        });

        it('turns any-release-ok off when its release is already the selected one', async () => {
            lidarrHas({ ...empty, releases: releases.map(r => ({ ...r, monitored: r.id === 2 })) });

            await monitorAndSearchAlbum('rg-1', 'http://lidarr:8686', 'key', 'rel-spotify');

            expect(putMock.mock.calls[0]?.[1]).toMatchObject({ anyReleaseOk: false });
        });
    });

    it('reports an unreachable Lidarr as the error it is', async () => {
        getMock.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:8686'));

        const outcome = await monitorAndSearchAlbum('rg-1', 'http://lidarr:8686', 'key');

        expect(outcome.success).toBe(false);
        expect(outcome.message).toContain('ECONNREFUSED');
        expect(outcome.message).not.toContain('not found');
    });
});
