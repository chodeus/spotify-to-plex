import { describe, expect, it } from 'vitest';
import { validateSearchApproaches } from './validateSearchApproaches';

describe('validateSearchApproaches', () => {
    // The sync throws on an empty list, so saving one would stop every playlist
    it('refuses an empty list', () => {
        expect(validateSearchApproaches([])).toBe(false);
    });

    it('accepts a list of valid approaches', () => {
        expect(validateSearchApproaches([{ id: 'normal', filtered: false, trim: false }])).toBe(true);
    });
});
