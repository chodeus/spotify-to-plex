import { describe, expect, it } from 'vitest';
import { albumBaseTitle } from './albumBaseTitle';

describe('albumBaseTitle', () => {
    // Album names from Lidarr "no MusicBrainz mapping" misses on a live install
    it.each([
        ['Bugatti (Explicit Version)', 'Bugatti'],
        ['Feeding The Wolves (Deluxe Version)', 'Feeding The Wolves'],
        ['LONG.LIVE.A$AP (Deluxe Version)', 'LONG.LIVE.A$AP'],
        ['Take Over Control (feat. Eva Simons) [Radio Edit]', 'Take Over Control'],
        ['Words (feat. Zara Larsson)', 'Words'],
        ['Blink-182 (Bonus Track Version)', 'Blink-182'],
        ['Days Gone By (Never Enough Edition)', 'Days Gone By'],
        ['Sempiternal (Expanded Edition)', 'Sempiternal'],
        ['The Poison (20th Anniversary Edition)', 'The Poison'],
        ['Strictly Dirty South (DJ Edition - Unmixed)', 'Strictly Dirty South']
    ])('drops the edition label from "%s"', (title, base) => {
        expect(albumBaseTitle(title)).toBe(base);
    });

    // These name other release groups, not editions of the same one
    it('keeps a live or remix qualifier', () => {
        expect(albumBaseTitle('Album (Live)')).toBe('Album (Live)');
        expect(albumBaseTitle('Cinema (Skrillex Remix)')).toBe('Cinema (Skrillex Remix)');
    });

    it('keeps a title that is nothing but a label', () => {
        expect(albumBaseTitle('(Deluxe Edition)')).toBe('(Deluxe Edition)');
    });
});
