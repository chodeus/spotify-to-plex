import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { LidarrLookupResult } from '@spotify-to-plex/shared-types/musicbrainz/LidarrLookupResult';
import { addOrMonitorAlbum } from './addOrMonitorAlbum';

vi.mock('axios', () => ({
    default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), isAxiosError: (error: { isAxiosError?: boolean }) => error?.isAxiosError === true }
}));

const getMock = axios.get as unknown as Mock;
const postMock = axios.post as unknown as Mock;
const putMock = axios.put as unknown as Mock;

const lookup = { foreignAlbumId: 'rg-1', title: 'Hooked', artist: { foreignArtistId: 'ar-1', artistName: 'NOTION' } } as LidarrLookupResult;
const settings = { url: 'http://lidarr:8686/', root_folder_path: '/music', quality_profile_id: 4, metadata_profile_id: 1 };
const releases = [{ id: 1, foreignReleaseId: 'rel-extended', monitored: true }, { id: 2, foreignReleaseId: 'rel-spotify', monitored: false }];

const adds = () => postMock.mock.calls.filter(([url]) => String(url).endsWith('/api/v1/album'));
const searches = () => postMock.mock.calls.filter(([, body]) => body?.name === 'AlbumSearch');

function rejectAdd(status: number, data: unknown) {
    postMock.mockImplementation(async (url: string) => {
        if (url.endsWith('/api/v1/album'))
            throw Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data } });

        return { data: {} };
    });
}

describe('addOrMonitorAlbum', () => {
    beforeEach(() => {
        getMock.mockReset();
        postMock.mockReset();
        putMock.mockReset();
        postMock.mockResolvedValue({ data: { id: 7 } });
        getMock.mockResolvedValue({ data: [{ id: 7, foreignAlbumId: 'rg-1', title: 'Hooked', monitored: true, artistId: 1, anyReleaseOk: true, releases, statistics: { trackFileCount: 0, totalTrackCount: 1 } }] });
    });

    it("adds without Lidarr's own search, pins Spotify's release, then searches once", async () => {
        const outcome = await addOrMonitorAlbum(lookup, 'rel-spotify', settings, 'key');

        expect(adds()).toHaveLength(1);
        expect(adds()[0]?.[0]).toBe('http://lidarr:8686/api/v1/album');
        expect(adds()[0]?.[1]).toMatchObject({ foreignAlbumId: 'rg-1', qualityProfileId: 4, rootFolderPath: '/music', addOptions: { searchForNewAlbum: false } });
        expect(putMock.mock.calls[0]?.[1]).toMatchObject({ anyReleaseOk: false, releases: [{ id: 1, monitored: false }, { id: 2, monitored: true }] });
        expect(searches()).toHaveLength(1);
        expect(outcome).toMatchObject({ result: 'added', ok: true });
    });

    it('takes the album Lidarr already has when it answers 409, and pins and searches that', async () => {
        rejectAdd(409, [{ errorCode: 'AlbumExistsValidator' }]);

        const outcome = await addOrMonitorAlbum(lookup, 'rel-spotify', settings, 'key');

        expect(putMock.mock.calls[0]?.[1]).toMatchObject({ anyReleaseOk: false });
        expect(searches()).toHaveLength(1);
        expect(outcome).toMatchObject({ result: 'existing', ok: true });
    });

    // With Lidarr's own search off, an add that timed out but went through must still end in a search
    it('retries an add that timed out, and takes the album when the retry meets a 409', async () => {
        let attempts = 0;
        postMock.mockImplementation(async (url: string) => {
            if (!url.endsWith('/api/v1/album'))
                return { data: {} };

            attempts++;
            if (attempts === 1)
                throw Object.assign(new Error('timeout of 30000ms exceeded'), { isAxiosError: true, code: 'ECONNABORTED' });

            throw Object.assign(new Error('Request failed with status code 409'), { response: { status: 409, data: [{ errorCode: 'AlbumExistsValidator' }] } });
        });

        vi.useFakeTimers();
        const outcome = await (async () => {
            try {
                const pending = addOrMonitorAlbum(lookup, 'rel-spotify', settings, 'key');
                await vi.advanceTimersByTimeAsync(5000);

                return await pending;
            } finally {
                vi.useRealTimers();
            }
        })();

        expect(attempts).toBe(2);
        expect(outcome).toMatchObject({ result: 'existing', ok: true });
        expect(putMock.mock.calls[0]?.[1]).toMatchObject({ anyReleaseOk: false });
        expect(searches()).toHaveLength(1);
    });

    it('searches without pinning, or waiting, when no release is known', async () => {
        await addOrMonitorAlbum(lookup, undefined, settings, 'key');

        expect(putMock).not.toHaveBeenCalled();
        expect(getMock).toHaveBeenCalledTimes(1);
        expect(searches()).toHaveLength(1);
    });

    describe("a new album's releases, which Lidarr loads after the add", () => {
        const notLoaded = { data: [{ id: 7, foreignAlbumId: 'rg-1', title: 'Hooked', monitored: true, artistId: 1, anyReleaseOk: true, releases: [] }] };

        beforeEach(() => { vi.useFakeTimers() });
        afterEach(() => { vi.useRealTimers() });

        // Releases arrive before the tracks; until the tracks do, Lidarr sends no statistics to tell an empty album by
        it('are waited for, with their tracks, then the release is pinned and searched once', async () => {
            const loaded = await getMock();
            const releasesOnly = { data: [{ ...notLoaded.data[0], releases }] };
            getMock.mockReset();
            getMock.mockResolvedValueOnce(notLoaded).mockResolvedValueOnce(releasesOnly)
                .mockResolvedValueOnce(releasesOnly)
                .mockResolvedValue(loaded);

            const pending = addOrMonitorAlbum(lookup, 'rel-spotify', settings, 'key');
            await vi.advanceTimersByTimeAsync(10_000);
            const outcome = await pending;

            expect(putMock.mock.calls[0]?.[1]).toMatchObject({ anyReleaseOk: false });
            expect(searches()).toHaveLength(1);
            expect(outcome.message).toBe("Album already monitored, Spotify's release selected, search triggered");
        });

        it('that never load still get a search, and the message says nothing was selected', async () => {
            getMock.mockResolvedValue(notLoaded);

            const pending = addOrMonitorAlbum(lookup, 'rel-spotify', settings, 'key');
            await vi.advanceTimersByTimeAsync(120_000);
            const outcome = await pending;

            expect(putMock).not.toHaveBeenCalled();
            expect(searches()).toHaveLength(1);
            expect(outcome.message).toContain('Lidarr had not loaded its releases yet, so none was selected');
        });
    });

    it("reports Lidarr's reason for refusing the add, and searches nothing", async () => {
        rejectAdd(400, [{ errorMessage: 'Root folder path does not exist' }]);

        const outcome = await addOrMonitorAlbum(lookup, 'rel-spotify', settings, 'key');

        expect(outcome).toEqual({ result: 'failed', ok: false, message: 'Root folder path does not exist' });
        expect(searches()).toHaveLength(0);
    });
});
