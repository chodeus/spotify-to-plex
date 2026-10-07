import { describe, expect, it } from 'vitest';
import type { SearchResponse } from '@spotify-to-plex/plex-music-search/types/SearchResponse';
import { mergeSearchResults } from './mergeSearchResults';

const response = (id: string, plexIds: string[], extra: Partial<SearchResponse> = {}): SearchResponse => ({
    id, title: id, artist: 'Artist', album: 'Album',
    result: plexIds.map(plexId => ({ id: plexId, guid: '', title: id, image: '', src: '', artist: { id: '', title: 'Artist' } })),
    ...extra
});
const order = ['a', 'b', 'c'].map(id => ({ id }));
const idsOf = (items: SearchResponse[]) => items.map(item => `${item.id}:${item.result.map(track => track.id).join('+')}`);

describe('mergeSearchResults', () => {
    it('replaces a re-checked link with the match the search found', () => {
        const { merged, found } = mergeSearchResults([response('a', ['old'])], [response('a', ['new'])], [{ id: 'a' }], order);

        expect(idsOf(merged)).toEqual(['a:new']);
        expect(idsOf(found)).toEqual(['a:new']);
    });

    it('keeps a re-checked link the search found nothing for, and confirms it', () => {
        const { merged, found, confirmed } = mergeSearchResults([response('a', ['old'])], [response('a', [])], [{ id: 'a' }], order);

        expect(idsOf(merged)).toEqual(['a:old']);
        expect(found).toEqual([]);
        expect(confirmed).toEqual(['a']);
    });

    // Plex being down is no evidence the link is still the best one
    it('keeps a re-checked link whose search failed, without confirming it', () => {
        const { merged, confirmed } = mergeSearchResults([response('a', ['old'])], [response('a', [], { failed: true })], [{ id: 'a' }], order);

        expect(idsOf(merged)).toEqual(['a:old']);
        expect(confirmed).toEqual([]);
    });

    it('keeps and confirms an ISRC link that a re-check only found a title match for', () => {
        const { merged, found, confirmed } = mergeSearchResults([response('a', ['isrc'], { matched_by: 'isrc' })], [response('a', ['title'])], [{ id: 'a' }], order);

        expect(idsOf(merged)).toEqual(['a:isrc']);
        expect(merged[0]?.matched_by).toBe('isrc');
        expect(found).toEqual([]);
        expect(confirmed).toEqual(['a']);
    });

    it('replaces an ISRC link with a newer ISRC match', () => {
        const { merged, found } = mergeSearchResults([response('a', ['old'], { matched_by: 'isrc' })], [response('a', ['new'], { matched_by: 'isrc' })], [{ id: 'a' }], order);

        expect(idsOf(merged)).toEqual(['a:new']);
        expect(idsOf(found)).toEqual(['a:new']);
    });

    it('puts every track in Spotify\'s order, wherever its link came from', () => {
        const { merged } = mergeSearchResults([response('c', ['3']), response('a', ['1'])], [response('b', ['2'])], [], order);

        expect(merged.map(item => item.id)).toEqual(['a', 'b', 'c']);
    });

    it('keeps a track Spotify lists twice in both of its places', () => {
        const { merged } = mergeSearchResults([response('a', ['1']), response('a', ['1'])], [response('b', ['2'])], [], [{ id: 'a' }, { id: 'b' }, { id: 'a' }]);

        expect(merged.map(item => item.id)).toEqual(['a', 'b', 'a']);
    });

    it('keeps an uncached track the search found nothing for, so it is reported missing', () => {
        const { merged } = mergeSearchResults([], [response('b', [])], [], order);

        expect(idsOf(merged)).toEqual(['b:']);
    });
});
