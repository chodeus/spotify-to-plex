import { describe, expect, it } from 'vitest';
import { filterOutWords } from './filterOutWords';

const textProcessing = {
    filterOutWords: ['radio edit', 'remaster'],
    filterOutQuotes: ['"'],
    cutOffSeparators: [' - ']
};

describe('filterOutWords', () => {
    // A leading dash used to leave only the dash, so the search queried for "-"
    it('drops a leading dash and keeps the rest', () => {
        expect(filterOutWords('- song title', textProcessing)).toBe('song title');
        expect(filterOutWords('-- song title', textProcessing)).toBe('song title');
    });

    // A trailing dash used to take the letter before it along
    it('drops a trailing dash without eating the title', () => {
        expect(filterOutWords('song title-', textProcessing)).toBe('song title');
        expect(filterOutWords('song-radio edit', textProcessing, true)).toBe('song');
    });

    it('leaves a title without dashes alone', () => {
        expect(filterOutWords('Song Title', textProcessing)).toBe('song title');
    });
});
