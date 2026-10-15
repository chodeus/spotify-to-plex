import { describe, expect, it } from 'vitest';
import { SearchResponse } from '@spotify-to-plex/plex-music-search/types/SearchResponse';
import { findMissingTracks } from './findMissingTracks';

const track = (id: string, title: string) => ({ id, title, artists: ['Artist'] });
const searched = (title: string, extra: Partial<SearchResponse> = {}): SearchResponse => ({ id: title, artist: 'Artist', title, album: '', result: [], ...extra });
const plexTrack = { id: '/library/metadata/1', title: 'Found', artist: { title: 'Artist' }, album: { title: '' } } as unknown as SearchResponse['result'][number];

describe('findMissingTracks', () => {
    it('reports a track Plex answered with no match', () => {
        expect(findMissingTracks([track('a', 'Gone')], [searched('Gone')], new Set())).toEqual([track('a', 'Gone')]);
    });

    it('does not report a track Plex matched', () => {
        expect(findMissingTracks([track('a', 'Found')], [searched('Found', { result: [plexTrack] })], new Set())).toEqual([]);
    });

    it('keeps reporting a track Plex could not search when the last list had it', () => {
        expect(findMissingTracks([track('a', 'Unasked')], [searched('Unasked', { failed: true })], new Set(['a']))).toEqual([track('a', 'Unasked')]);
    });

    it('does not report a track Plex could not search when the last list did not have it', () => {
        expect(findMissingTracks([track('a', 'Unasked')], [searched('Unasked', { failed: true })], new Set(['b']))).toEqual([]);
    });

    it('matches the last list by the bare id of a spotify:track uri', () => {
        const uri = track('spotify:track:a', 'Unasked');

        expect(findMissingTracks([uri], [searched('Unasked', { failed: true })], new Set(['a']))).toEqual([uri]);
    });
});
