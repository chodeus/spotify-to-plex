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

    it('cuts a credit with no space after its dot, or in square brackets', () => {
        expect(removeFeaturing('Eminem feat.Rihanna')).toBe('Eminem');
        expect(removeFeaturing('Song [ft. Someone]')).toBe('Song');
    });

    // "Feat" without its dot is a word in a name, and "Ft." is a place
    it('leaves a name with "Feat" or "Ft." in the middle', () => {
        expect(removeFeaturing('Little Feat & Bonnie Raitt')).toBe('Little Feat & Bonnie Raitt');
        expect(removeFeaturing('Little Feat feat. Emmylou Harris')).toBe('Little Feat');
        expect(removeFeaturing('The Ft. Worth Symphony')).toBe('The Ft. Worth Symphony');
    });

    it('still cuts at a bracket', () => {
        expect(removeFeaturing('Song (Live)')).toBe('Song');
    });
});
