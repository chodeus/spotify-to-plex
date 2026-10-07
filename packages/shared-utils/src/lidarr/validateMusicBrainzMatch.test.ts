import { describe, expect, it } from 'vitest';
import { validateMusicBrainzMatch } from './validateMusicBrainzMatch';

describe('validateMusicBrainzMatch', () => {
    it('matches an album whose Spotify title carries an edition label', () => {
        expect(validateMusicBrainzMatch('Ace Hood', 'Bugatti (Explicit Version)', ['Ace Hood'], 'Bugatti')).toBe(true);
        expect(validateMusicBrainzMatch('Kanye West', 'Graduation (Deluxe Edition)', ['Kanye West'], 'Graduation')).toBe(true);
    });

    // An act renamed since: MusicBrainz credits "Kanye West" on the release and names the artist "Ye"
    it('accepts any credited name for the artist', () => {
        expect(validateMusicBrainzMatch('Kanye West', 'Late Registration', ['Kanye West', 'Ye'], 'Late Registration')).toBe(true);
        expect(validateMusicBrainzMatch('Ye', 'Late Registration', ['Kanye West', 'Ye'], 'Late Registration')).toBe(true);
    });

    // Both used to clear 0.8 as one joined string and were cached for good
    it('rejects the same artist\'s other release group', () => {
        expect(validateMusicBrainzMatch('Eminem', 'Curtain Call: The Hits', ['Eminem'], 'Curtain Call 2')).toBe(false);
    });

    it('rejects another artist behind a long shared title', () => {
        expect(validateMusicBrainzMatch('Billy Idol', 'The Very Best of the Eighties Remastered Collection Volume Two', ['Various Artists'], 'The Very Best of the Eighties Remastered Collection Volume Two')).toBe(false);
    });

    it('rejects a live album for the studio one', () => {
        expect(validateMusicBrainzMatch('Some Band', 'Album (Live)', ['Some Band'], 'Album')).toBe(false);
    });
});
