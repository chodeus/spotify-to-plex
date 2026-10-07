import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@spotify-to-plex/shared-utils/spotify/getAccessToken', () => ({ getAccessToken: vi.fn() }));
vi.mock('@spotify-to-plex/shared-utils/spotify/getSpotifyData', () => ({ getSpotifyData: vi.fn() }));

const { getAccessToken } = await import('@spotify-to-plex/shared-utils/spotify/getAccessToken');
const { getSpotifyData } = await import('@spotify-to-plex/shared-utils/spotify/getSpotifyData');
const { loadSpotifyData } = await import('./loadSpotifyData');

const tokenMock = getAccessToken as unknown as Mock;
const dataMock = getSpotifyData as unknown as Mock;

describe('loadSpotifyData', () => {
    beforeEach(() => {
        process.env.SPOTIFY_API_CLIENT_ID = 'client';
        process.env.SPOTIFY_API_CLIENT_SECRET = 'secret';
        tokenMock.mockReset();
        dataMock.mockReset();
    });

    // The playlist log shows this message, so a generic one hides why the sync was refused
    it("passes the scraper's own error through when there is no user token to fall back from", async () => {
        tokenMock.mockResolvedValue(null);
        dataMock.mockRejectedValue(new Error('Refusing to sync a truncated playlist'));

        await expect(loadSpotifyData('spotify:playlist:p')).rejects.toThrow('Refusing to sync a truncated playlist');
    });

    it('retries with client credentials when the user token fails', async () => {
        tokenMock.mockResolvedValue({ access_token: 'user-token', token_type: 'Bearer', expires_in: 3600, refresh_token: '' });
        dataMock.mockRejectedValueOnce(new Error('403')).mockResolvedValueOnce({ id: 'p', tracks: [] });

        await expect(loadSpotifyData('spotify:playlist:p')).resolves.toEqual({ id: 'p', tracks: [] });
        expect(dataMock).toHaveBeenCalledTimes(2);
    });
});
