import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { PlexMusicSearchConfig } from '@spotify-to-plex/plex-music-search/types/PlexMusicSearchConfig';
import type { GetSpotifyPlaylist } from '@spotify-to-plex/shared-types/spotify/GetSpotifyPlaylist';

vi.mock('@spotify-to-plex/plex-music-search/functions/getById', () => ({ getById: vi.fn() }));

const { getById } = await import('@spotify-to-plex/plex-music-search/functions/getById');
const { getCachedPlexTracks } = await import('./getCachedPlexTracks');

const getByIdMock = getById as unknown as Mock;
const config = { uri: 'http://192.168.1.20:32400', token: 'token' } as PlexMusicSearchConfig;

// The plex title differs from Spotify's version suffix, which the version check rejects
const playlist = {
    type: 'spotify-playlist', id: 'p', title: 'Playlist', image: '', owner: '',
    tracks: [{ id: 'spotify-1', title: 'Song - Club Mix', album: 'Album', artists: ['Artist'], album_id: 'a', duration_ms: 200_000 }]
} as GetSpotifyPlaylist;

describe('getCachedPlexTracks', () => {
    let dir: string;

    const writeLink = (link: object) => {
        writeFileSync(join(dir, 'track_links.json'), JSON.stringify([{ spotify_id: 'spotify-1', plex_id: ['/library/metadata/1'], ...link }]));
    };

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'cached-plex-'));
        process.env.STORAGE_DIR = dir;
        getByIdMock.mockReset();
        getByIdMock.mockResolvedValue({ id: '/library/metadata/1', title: 'Song (explicit)', duration_ms: 200_000 });
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
        delete process.env.STORAGE_DIR;
    });

    it('keeps an ISRC-matched link whose title the version check would reject', async () => {
        writeLink({ plex_matched_by: 'isrc' });

        const { result } = await getCachedPlexTracks(config, playlist);

        expect(result[0]?.result.map(track => track.id)).toEqual(['/library/metadata/1']);
    });

    it('still drops a title-matched link with the same mismatch', async () => {
        writeLink({});

        const { result } = await getCachedPlexTracks(config, playlist);

        expect(result).toEqual([]);
        expect(JSON.parse(readFileSync(join(dir, 'track_links.json'), 'utf8'))[0].plex_id).toEqual([]);
    });
});
