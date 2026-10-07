import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { PlexMusicSearchConfig } from '@spotify-to-plex/plex-music-search/types/PlexMusicSearchConfig';
import type { GetSpotifyPlaylist } from '@spotify-to-plex/shared-types/spotify/GetSpotifyPlaylist';

vi.mock('@spotify-to-plex/plex-music-search/functions/getById', () => ({ getById: vi.fn() }));

const { getById } = await import('@spotify-to-plex/plex-music-search/functions/getById');
const { getCachedPlexTracks } = await import('./getCachedPlexTracks');
const { PlexItemMissingError } = await import('@spotify-to-plex/plex-music-search/utils/PlexItemMissingError');

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

    // mergeSearchResults needs it to keep the link against a re-check's title match
    it('passes the ISRC mark on with the cached result', async () => {
        writeLink({ plex_matched_by: 'isrc' });

        const { result } = await getCachedPlexTracks(config, playlist);

        expect(result[0]?.matched_by).toBe('isrc');
    });

    it('still drops a title-matched link with the same mismatch', async () => {
        writeLink({});

        const { result } = await getCachedPlexTracks(config, playlist);

        expect(result).toEqual([]);
        expect(JSON.parse(readFileSync(join(dir, 'track_links.json'), 'utf8'))[0].plex_id).toEqual([]);
    });

    it('drops an ISRC-matched link whose duration contradicts the track', async () => {
        writeLink({ plex_matched_by: 'isrc' });
        getByIdMock.mockResolvedValue({ id: '/library/metadata/1', title: 'Song (explicit)', duration_ms: 522_000 });

        const { result } = await getCachedPlexTracks(config, playlist);

        expect(result).toEqual([]);
    });

    it('frees a manual link Plex no longer has for a new match', async () => {
        writeLink({ manual: true });
        getByIdMock.mockRejectedValue(new PlexItemMissingError('/library/metadata/1'));

        const { result } = await getCachedPlexTracks(config, playlist);

        expect(result).toEqual([]);
        expect(JSON.parse(readFileSync(join(dir, 'track_links.json'), 'utf8'))[0]).toEqual({ spotify_id: 'spotify-1', plex_id: [] });
    });

    it('keeps a manual link while Plex is unreachable', async () => {
        writeLink({ manual: true });
        getByIdMock.mockRejectedValue(new Error('connect ECONNREFUSED'));

        await getCachedPlexTracks(config, playlist);

        expect(JSON.parse(readFileSync(join(dir, 'track_links.json'), 'utf8'))[0]).toMatchObject({ plex_id: ['/library/metadata/1'], manual: true });
    });

    describe('weekly re-check', () => {
        const DAY = 24 * 60 * 60 * 1000;
        const storedLink = () => JSON.parse(readFileSync(join(dir, 'track_links.json'), 'utf8'))[0];

        it('hands back a link last confirmed over a week ago for a fresh search', async () => {
            writeLink({ plex_matched_by: 'isrc', plex_checked_at: Date.now() - 8 * DAY });

            const { recheck, result } = await getCachedPlexTracks(config, playlist);

            expect(recheck.map(track => track.id)).toEqual(['spotify-1']);
            // Its cached tracks still play until a search finds better
            expect(result[0]?.result.map(track => track.id)).toEqual(['/library/metadata/1']);
        });

        it('leaves a link confirmed this week alone', async () => {
            writeLink({ plex_matched_by: 'isrc', plex_checked_at: Date.now() - DAY });

            const { recheck } = await getCachedPlexTracks(config, playlist);

            expect(recheck).toEqual([]);
        });

        it('never re-checks a manual pick', async () => {
            writeLink({ plex_matched_by: 'isrc', manual: true, plex_checked_at: Date.now() - 30 * DAY });

            const { recheck } = await getCachedPlexTracks(config, playlist);

            expect(recheck).toEqual([]);
        });

        // Stamping every old link "now" would make them all due on the same night
        it('stamps an unstamped link somewhere in the past week and saves it', async () => {
            writeLink({ plex_matched_by: 'isrc' });
            const before = Date.now();

            const { recheck } = await getCachedPlexTracks(config, playlist);
            const stamp = storedLink().plex_checked_at;

            expect(recheck).toEqual([]);
            expect(stamp).toBeGreaterThan(before - 7 * DAY);
            // "spotify-1" spreads to about 145 hours back; a stamp of "now" would not be below the start
            expect(stamp).toBeLessThan(before);
        });

        // A stamp from a clock running ahead would keep the link from ever coming due
        it('restamps a link stamped in the future', async () => {
            writeLink({ plex_checked_at: Date.now() + 30 * DAY });
            getByIdMock.mockResolvedValue({ id: '/library/metadata/1', title: 'Song - Club Mix', duration_ms: 200_000 });
            const before = Date.now();

            await getCachedPlexTracks(config, playlist);

            expect(storedLink().plex_checked_at).toBeLessThan(before);
        });
    });
});
