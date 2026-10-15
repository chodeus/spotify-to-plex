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

    // The trimmed searches sent "679 (feat. remy boyz)" whole, so Plex never found Fetty Wap's "679"
    it('trims a short title at a separator a space sets off', () => {
        const separators = { ...textProcessing, cutOffSeparators: ['(', '-'] };

        expect(filterOutWords('679 (feat. Remy Boyz)', separators, false, true)).toBe('679');
        expect(filterOutWords('Me (feat. BOI)', separators, false, true)).toBe('me');
        expect(filterOutWords('Up - Remix', separators, false, true)).toBe('up');
    });

    it('does not trim a short title inside a word', () => {
        const separators = { ...textProcessing, cutOffSeparators: ['(', '-'] };

        expect(filterOutWords('X-Ray', separators, false, true)).toBe('x-ray');
        expect(filterOutWords('(Intro)', separators, false, true)).toBe('(intro)');
    });
});
