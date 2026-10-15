import { describe, expect, it } from 'vitest';
import { SearchResponse } from '@spotify-to-plex/plex-music-search/types/SearchResponse';
import { findMissingTracks } from './findMissingTracks';

const track = (id: string, title = 'Song') => ({ id, title, artists: ['Artist'] });
const searched = (id: string, extra: Partial<SearchResponse> = {}): SearchResponse => ({ id, artist: 'Artist', title: 'Song', album: '', result: [], ...extra });
const plexTrack = { id: '/library/metadata/1', title: 'Song', artist: { title: 'Artist' }, album: { title: '' } } as unknown as SearchResponse['result'][number];

describe('findMissingTracks', () => {
    it('reports a track Plex answered with no match', () => {
        expect(findMissingTracks([track('a')], [searched('a')], new Set())).toEqual([track('a')]);
    });

    it('does not report a track Plex matched', () => {
        expect(findMissingTracks([track('a')], [searched('a', { result: [plexTrack] })], new Set())).toEqual([]);
    });

    it('keeps reporting a track Plex could not search when the last list had it', () => {
        expect(findMissingTracks([track('a')], [searched('a', { failed: true })], new Set(['a']))).toEqual([track('a')]);
    });

    it('does not report a track Plex could not search when the last list did not have it', () => {
        expect(findMissingTracks([track('a')], [searched('a', { failed: true })], new Set(['b']))).toEqual([]);
    });

    it('judges each track by its own response when another track shares its title and artist', () => {
        const responses = [searched('a', { result: [plexTrack] }), searched('b', { failed: true })];

        expect(findMissingTracks([track('a'), track('b')], responses, new Set(['a']))).toEqual([]);
    });

    it('matches the last list by the bare id of a spotify:track uri', () => {
        const uri = track('spotify:track:a');

        expect(findMissingTracks([uri], [searched('spotify:track:a', { failed: true })], new Set(['a']))).toEqual([uri]);
    });
});
