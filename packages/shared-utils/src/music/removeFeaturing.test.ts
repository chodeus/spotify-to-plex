import { describe, expect, it } from 'vitest';
import { removeFeaturing } from './removeFeaturing';

describe('removeFeaturing', () => {
    it('cuts a featured-artist credit', () => {
        expect(removeFeaturing('Eminem feat. Rihanna')).toBe('Eminem');
        expect(removeFeaturing('Song Featuring Someone')).toBe('Song');
        expect(removeFeaturing('Song ft. Someone')).toBe('Song');
        expect(removeFeaturing('Song (feat. Someone)')).toBe('Song');
    });

    // "feat" inside a word is not a credit
    it('leaves names that only contain "feat"', () => {
        expect(removeFeaturing('Undefeated')).toBe('Undefeated');
        expect(removeFeaturing('Feathers')).toBe('Feathers');
        expect(removeFeaturing('Defeater')).toBe('Defeater');
        expect(removeFeaturing('Little Feat')).toBe('Little Feat');
    });

    it('still cuts at a bracket', () => {
        expect(removeFeaturing('Song (Live)')).toBe('Song');
    });
});
