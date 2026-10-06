import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { PlexMusicSearchConfig } from '@spotify-to-plex/plex-music-search/types/PlexMusicSearchConfig';
import type { PlexTrack } from '@spotify-to-plex/plex-music-search/types/PlexTrack';
import type { SearchResponse } from '@spotify-to-plex/plex-music-search/types/SearchResponse';
import type { Track } from '@spotify-to-plex/shared-types/spotify/Track';

vi.mock('@spotify-to-plex/shared-utils/musicbrainz/getMusicBrainzTrackIdsByIsrc', () => ({ getMusicBrainzTrackIdsByIsrc: vi.fn() }));
vi.mock('@spotify-to-plex/plex-music-search/functions/findTracksByMusicBrainzIds', () => ({ findTracksByMusicBrainzIds: vi.fn() }));

const { getMusicBrainzTrackIdsByIsrc } = await import('@spotify-to-plex/shared-utils/musicbrainz/getMusicBrainzTrackIdsByIsrc');
const { findTracksByMusicBrainzIds } = await import('@spotify-to-plex/plex-music-search/functions/findTracksByMusicBrainzIds');
const { matchByIsrc } = await import('./matchByIsrc');

const lookupMock = getMusicBrainzTrackIdsByIsrc as unknown as Mock;
const findMock = findTracksByMusicBrainzIds as unknown as Mock;
const config = { uri: 'http://192.168.1.20:32400', token: 'token' } as PlexMusicSearchConfig;

const spotifyTrack: Track = { id: 'spotify-1', title: 'Song - Club Mix', album: 'Album A', artists: ['Artist'], album_id: 'album-1', isrc: 'XXA000000001' };
const unmatched: SearchResponse = { id: 'spotify-1', artist: 'Artist', title: 'Song - Club Mix', album: 'Album A', result: [] };

function plexTrack(id: string, durationMs?: number): PlexTrack {
    return { id, guid: `plex://track/${id}`, title: `Track ${id}`, image: '', src: '', artist: { id: 'artist', title: 'Artist' }, duration_ms: durationMs };
}

// findTracksByMusicBrainzIds answers per album title
function plexHas(byAlbum: Record<string, PlexTrack[]>) {
    findMock.mockImplementation(async (_config: unknown, _artist: string, album: string) => byAlbum[album] ?? []);
}

describe('matchByIsrc', () => {
    beforeEach(() => {
        lookupMock.mockReset();
        findMock.mockReset();
        lookupMock.mockResolvedValue({ status: 'found', trackIds: ['track-a'], releaseTitles: ['Album A', 'Compilation', 'Single'] });
    });

    it('matches the one track on the Spotify album and marks it', async () => {
        plexHas({ 'Album A': [plexTrack('/library/metadata/1')] });

        const [result] = await matchByIsrc(config, [unmatched], [spotifyTrack]);

        expect(result?.result.map(track => track.id)).toEqual(['/library/metadata/1']);
        expect(result?.matched_by).toBe('isrc');
    });

    it('leaves the track unmatched when the Spotify album holds two candidates', async () => {
        plexHas({
            'Album A': [plexTrack('/library/metadata/1'), plexTrack('/library/metadata/2')],
            'Single': [plexTrack('/library/metadata/3')]
        });

        const [result] = await matchByIsrc(config, [unmatched], [spotifyTrack]);

        expect(result?.result).toEqual([]);
        expect(result?.matched_by).toBeUndefined();
    });

    it('falls back to the other releases only when the Spotify album finds nothing', async () => {
        plexHas({ 'Single': [plexTrack('/library/metadata/3')] });

        const [result] = await matchByIsrc(config, [unmatched], [spotifyTrack]);

        expect(result?.result.map(track => track.id)).toEqual(['/library/metadata/3']);
    });

    it('leaves the track unmatched when two other releases disagree', async () => {
        plexHas({ 'Single': [plexTrack('/library/metadata/3')], 'Compilation': [plexTrack('/library/metadata/4')] });

        const [result] = await matchByIsrc(config, [unmatched], [spotifyTrack]);

        expect(result?.result).toEqual([]);
    });

    it('counts the same plex track found under two titles once', async () => {
        plexHas({ 'Single': [plexTrack('/library/metadata/3')], 'Compilation': [plexTrack('/library/metadata/3')] });

        const [result] = await matchByIsrc(config, [unmatched], [spotifyTrack]);

        expect(result?.result.map(track => track.id)).toEqual(['/library/metadata/3']);
    });

    it('searches at most ten of the other releases', async () => {
        const releaseTitles = Array.from({ length: 30 }, (_v, i) => `Compilation ${i}`);
        lookupMock.mockResolvedValue({ status: 'found', trackIds: ['track-a'], releaseTitles });
        plexHas({});

        await matchByIsrc(config, [unmatched], [spotifyTrack]);

        expect(findMock).toHaveBeenCalledTimes(11);
    });

    it('leaves matched results and tracks without an ISRC alone', async () => {
        const matched: SearchResponse = { ...unmatched, result: [plexTrack('/library/metadata/9')] };
        const noIsrc: Track = { ...spotifyTrack, id: 'spotify-2', isrc: undefined };

        const results = await matchByIsrc(config, [matched, { ...unmatched, id: 'spotify-2' }], [spotifyTrack, noIsrc]);

        expect(results[0]).toBe(matched);
        expect(results[1]?.result).toEqual([]);
        expect(lookupMock).not.toHaveBeenCalled();
    });

    it('leaves the track unmatched when MusicBrainz has no answer', async () => {
        lookupMock.mockResolvedValue({ status: 'unavailable' });

        const [result] = await matchByIsrc(config, [unmatched], [spotifyTrack]);

        expect(result?.result).toEqual([]);
        expect(findMock).not.toHaveBeenCalled();
    });

    it('leaves the track unmatched when the one candidate is a different length', async () => {
        plexHas({ 'Album A': [plexTrack('/library/metadata/1', 522_000)] });

        const [result] = await matchByIsrc(config, [unmatched], [{ ...spotifyTrack, duration_ms: 183_000 }]);

        expect(result?.result).toEqual([]);
        expect(result?.matched_by).toBeUndefined();
        expect(lookupMock).toHaveBeenCalledWith('XXA000000001', 183_000);
    });

    it('takes the candidate that fits when the other one is a different length', async () => {
        plexHas({ 'Album A': [plexTrack('/library/metadata/1', 522_000), plexTrack('/library/metadata/2', 190_000)] });

        const [result] = await matchByIsrc(config, [unmatched], [{ ...spotifyTrack, duration_ms: 183_000 }]);

        expect(result?.result.map(track => track.id)).toEqual(['/library/metadata/2']);
    });

    it('looks at the other releases when the Spotify album candidate is a different length', async () => {
        plexHas({ 'Album A': [plexTrack('/library/metadata/1', 522_000)], 'Single': [plexTrack('/library/metadata/3', 185_000)] });

        const [result] = await matchByIsrc(config, [unmatched], [{ ...spotifyTrack, duration_ms: 183_000 }]);

        expect(result?.result.map(track => track.id)).toEqual(['/library/metadata/3']);
    });

    it('refuses a different-length candidate on the other releases', async () => {
        plexHas({ 'Single': [plexTrack('/library/metadata/3', 522_000)] });

        const [result] = await matchByIsrc(config, [unmatched], [{ ...spotifyTrack, duration_ms: 183_000 }]);

        expect(result?.result).toEqual([]);
    });

    it('still refuses two candidates that both fit', async () => {
        plexHas({ 'Album A': [plexTrack('/library/metadata/1', 185_000), plexTrack('/library/metadata/2', 190_000)] });

        const [result] = await matchByIsrc(config, [unmatched], [{ ...spotifyTrack, duration_ms: 183_000 }]);

        expect(result?.result).toEqual([]);
    });

    it('matches a candidate within radio versus album variance', async () => {
        plexHas({ 'Album A': [plexTrack('/library/metadata/1', 209_000)] });

        const [result] = await matchByIsrc(config, [unmatched], [{ ...spotifyTrack, duration_ms: 183_000 }]);

        expect(result?.matched_by).toBe('isrc');
    });

    it('lets any album artist through on the Spotify album only', async () => {
        plexHas({});

        await matchByIsrc(config, [unmatched], [spotifyTrack]);

        const artistRules = findMock.mock.calls.map(call => call[4]);
        expect(artistRules).toEqual([{ similarity: 0, contain: false }, undefined, undefined]);
    });

    it('leaves the track unmatched when Plex fails, and says so', async () => {
        findMock.mockRejectedValue('Could not connect to server');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* expected */ });

        const [result] = await matchByIsrc(config, [unmatched], [spotifyTrack]);

        expect(result?.result).toEqual([]);
        expect(warn).toHaveBeenCalledWith('ISRC match skipped for "Song - Club Mix": Could not connect to server');
        warn.mockRestore();
    });
});
