import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Playlist } from '@spotify-to-plex/shared-types/plex/Playlist';
import type { SearchResponse } from '@spotify-to-plex/plex-music-search/types/SearchResponse';

vi.mock('@spotify-to-plex/plex-helpers/playlist/addItemsToPlaylist', () => ({ addItemsToPlaylist: vi.fn() }));
vi.mock('@spotify-to-plex/plex-helpers/playlist/getPlaylistItemKeys', () => ({ getPlaylistItemKeys: vi.fn() }));
vi.mock('@spotify-to-plex/plex-helpers/playlist/removeItemsFromPlaylist', () => ({ removeItemsFromPlaylist: vi.fn() }));
vi.mock('@spotify-to-plex/plex-helpers/playlist/storePlaylist', () => ({ storePlaylist: vi.fn() }));
vi.mock('@spotify-to-plex/plex-helpers/playlist/updatePlaylist', () => ({ updatePlaylist: vi.fn() }));
vi.mock('@spotify-to-plex/plex-helpers/playlist/putPlaylistPoster', () => ({ putPlaylistPoster: vi.fn() }));
vi.mock('@spotify-to-plex/plex-config/functions/getSettings', () => ({ getSettings: vi.fn() }));
vi.mock('@spotify-to-plex/plex-config/functions/addPlaylist', () => ({ addPlaylist: vi.fn() }));

const { addItemsToPlaylist } = await import('@spotify-to-plex/plex-helpers/playlist/addItemsToPlaylist');
const { getPlaylistItemKeys } = await import('@spotify-to-plex/plex-helpers/playlist/getPlaylistItemKeys');
const { removeItemsFromPlaylist } = await import('@spotify-to-plex/plex-helpers/playlist/removeItemsFromPlaylist');
const { storePlaylist } = await import('@spotify-to-plex/plex-helpers/playlist/storePlaylist');
const { updatePlaylist } = await import('@spotify-to-plex/plex-helpers/playlist/updatePlaylist');
const { getSettings } = await import('@spotify-to-plex/plex-config/functions/getSettings');
const { addPlaylist } = await import('@spotify-to-plex/plex-config/functions/addPlaylist');
const { putPlexPlaylist } = await import('./putPlexTracks');

const addMock = addItemsToPlaylist as unknown as Mock;
const keysMock = getPlaylistItemKeys as unknown as Mock;
const removeMock = removeItemsFromPlaylist as unknown as Mock;
const storeMock = storePlaylist as unknown as Mock;
const updateMock = updatePlaylist as unknown as Mock;

const matched = (id: string): SearchResponse => ({ id: `spotify-${id}`, title: id, artist: 'Artist', album: 'Album', result: [{ id: `/library/metadata/${id}`, guid: '', title: id, image: '', src: '', artist: { id: '', title: 'Artist' } }] });
const unmatched: SearchResponse = { id: 'spotify-x', title: 'x', artist: 'Artist', album: 'Album', result: [] };
const playlist = { ratingKey: '500', title: 'Playlist' } as Playlist;
const keys = (...ids: string[]) => ids.map(id => `/library/metadata/${id}`);

describe('putPlexPlaylist', () => {
    beforeEach(() => {
        for (const mock of [addMock, keysMock, removeMock, storeMock, updateMock])
            mock.mockReset();
        (getSettings as unknown as Mock).mockResolvedValue({ uri: 'http://plex.test:32400', token: 'token', id: 'machine' });
        storeMock.mockResolvedValue('600');
        addMock.mockResolvedValue([]);
        (addPlaylist as unknown as Mock).mockReset();
    });

    it('rewrites an existing playlist with every matched track, the first included', async () => {
        keysMock.mockResolvedValue(keys('9'));

        await putPlexPlaylist('p', playlist, [matched('1'), unmatched, matched('2'), matched('3')], 'Playlist', '');

        expect(removeMock).toHaveBeenCalledTimes(1);
        expect(addMock.mock.calls[0]?.[2].map((item: { key: string }) => item.key)).toEqual(keys('1', '2', '3'));
    });

    it('leaves a playlist that already holds these tracks in this order', async () => {
        keysMock.mockResolvedValue(keys('1', '2'));

        await putPlexPlaylist('p', playlist, [matched('1'), matched('2')], 'Renamed', '');

        expect(removeMock).not.toHaveBeenCalled();
        expect(addMock).not.toHaveBeenCalled();
        expect(updateMock).toHaveBeenCalledWith(expect.anything(), '500', { title: 'Renamed' });
    });

    it('rewrites a playlist whose order changed', async () => {
        keysMock.mockResolvedValue(keys('2', '1'));

        await putPlexPlaylist('p', playlist, [matched('1'), matched('2')], 'Playlist', '');

        expect(removeMock).toHaveBeenCalledTimes(1);
        expect(addMock.mock.calls[0]?.[2]).toHaveLength(2);
    });

    it('creates a playlist from the first track and adds the rest once', async () => {
        await putPlexPlaylist('p', null, [matched('1'), matched('2'), matched('3')], 'New', '');

        expect(storeMock).toHaveBeenCalledWith(expect.anything(), 'New', 'server://machine/com.plexapp.plugins.library/library/metadata/1');
        expect(addMock.mock.calls[0]?.[2].map((item: { key: string }) => item.key)).toEqual(keys('2', '3'));
    });

    it('leaves Plex alone when nothing matched', async () => {
        await putPlexPlaylist('p', playlist, [unmatched], 'Playlist', '');

        expect(keysMock).not.toHaveBeenCalled();
        expect(removeMock).not.toHaveBeenCalled();
    });

    // Recorded after the adds, a Plex that went away mid-add left a playlist the next sync created again
    it('records a new playlist before adding its tracks', async () => {
        addMock.mockRejectedValue(new Error('connect ECONNREFUSED'));

        await expect(putPlexPlaylist('p', null, [matched('1'), matched('2')], 'Playlist', '')).rejects.toThrow('ECONNREFUSED');
        expect(addPlaylist).toHaveBeenCalledWith({ type: 'playlist', id: 'p', plex: '600' });
    });
});
