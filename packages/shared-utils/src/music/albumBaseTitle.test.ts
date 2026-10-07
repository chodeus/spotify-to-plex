import { describe, expect, it } from 'vitest';
import { albumBaseTitle, albumEdition } from './albumBaseTitle';

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

    // Labels outside brackets, nested, or with words the first list lacked: each came back "not found" and was cached
    it.each([
        ['In Utero - 20th Anniversary Remaster', 'In Utero'],
        ['Bleach: Deluxe Edition', 'Bleach'],
        ['Pure Heroine (Extended)', 'Pure Heroine'],
        ['Thriller 25 Super Deluxe Edition', 'Thriller 25'],
        ['Back to Black (Deluxe Edition) – 2008', 'Back to Black'],
        ['Album (Deluxe Edition [Remastered])', 'Album'],
        ['Guardians of the Galaxy Vol. 2: Awesome Mix Vol. 2 (Original Motion Picture Soundtrack)', 'Guardians of the Galaxy Vol. 2: Awesome Mix Vol. 2']
    ])('drops the label from "%s"', (title, base) => {
        expect(albumBaseTitle(title)).toBe(base);
    });

    // A remix is another release group, even with an edition word in its bracket
    it('keeps a remix qualifier', () => {
        expect(albumBaseTitle('Cinema (Skrillex Remix)')).toBe('Cinema (Skrillex Remix)');
        expect(albumBaseTitle('Rather Be (Clean Bandit Remix)')).toBe('Rather Be (Clean Bandit Remix)');
    });

    // MusicBrainz marks a live album with the Live type, not "(Live)" in the title
    it('drops a live label and says it was there', () => {
        expect(albumEdition('Unplugged (Live)')).toEqual({ base: 'Unplugged', live: true });
        expect(albumEdition('Album (Live / Deluxe Edition)')).toEqual({ base: 'Album', live: true });
        expect(albumEdition('Graduation (Deluxe Edition)')).toEqual({ base: 'Graduation', live: false });
    });

    it('keeps a live qualifier that names more than the edition, and "Live" in the title itself', () => {
        expect(albumEdition('Songs (Live at the Anniversary Party)')).toEqual({ base: 'Songs (Live at the Anniversary Party)', live: false });
        expect(albumEdition('Live Through This')).toEqual({ base: 'Live Through This', live: false });
    });

    it('keeps a title that is nothing but a label', () => {
        expect(albumBaseTitle('(Deluxe Edition)')).toBe('(Deluxe Edition)');
    });
});
