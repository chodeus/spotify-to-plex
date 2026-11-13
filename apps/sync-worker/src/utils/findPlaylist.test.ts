import { describe, expect, it, vi } from 'vitest';

vi.mock('@spotify-to-plex/http-client/AxiosRequest', () => ({ AxiosRequest: { get: vi.fn() } }));

const { findPlaylist } = await import('@spotify-to-plex/plex-helpers/playlist/findPlaylist');
const { AxiosRequest } = await import('@spotify-to-plex/http-client/AxiosRequest');

const plex = { uri: 'http://plex.test:32400', token: 'token' };

describe('findPlaylist', () => {
    // A Plex Home user with no playlists yet: Plex leaves Metadata out
    it('finds nothing, rather than failing, in an account with no playlists', async () => {
        vi.mocked(AxiosRequest.get).mockResolvedValue({ data: { MediaContainer: { size: 0 } } } as never);

        expect(await findPlaylist(plex, '900')).toBeUndefined();
    });

    it('finds the playlist by its ratingKey', async () => {
        vi.mocked(AxiosRequest.get).mockResolvedValue({ data: { MediaContainer: { size: 2, Metadata: [{ ratingKey: '800' }, { ratingKey: '900', title: 'Mine' }] } } } as never);

        expect(await findPlaylist(plex, '900')).toEqual({ ratingKey: '900', title: 'Mine' });
    });
});
