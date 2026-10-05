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

function plexTrack(id: string): PlexTrack {
    return { id, guid: `plex://track/${id}`, title: `Track ${id}`, image: '', src: '', artist: { id: 'artist', title: 'Artist' } };
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

    it('leaves the track unmatched when Plex fails', async () => {
        findMock.mockRejectedValue(new Error('Could not connect to server'));

        const [result] = await matchByIsrc(config, [unmatched], [spotifyTrack]);

        expect(result?.result).toEqual([]);
    });
});
