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

    // Each clears 0.8 as one joined string, so artist and album must be judged apart
    it('rejects the same artist\'s other release group', () => {
        expect(validateMusicBrainzMatch('Eminem', 'Curtain Call: The Hits', ['Eminem'], 'Curtain Call 2')).toBe(false);
    });

    it('rejects another artist behind a long shared title', () => {
        expect(validateMusicBrainzMatch('Billy Idol', 'The Very Best of the Eighties Remastered Collection Volume Two', ['Various Artists'], 'The Very Best of the Eighties Remastered Collection Volume Two')).toBe(false);
    });

    // MusicBrainz titles the live release group "Unplugged" and gives it the Live type
    it('matches a live album by its type, and refuses a studio one however long the title', () => {
        expect(validateMusicBrainzMatch('Eric Clapton', 'Unplugged (Live)', ['Eric Clapton'], 'Unplugged', ['Live'])).toBe(true);
        expect(validateMusicBrainzMatch('Some Band', 'Album (Live)', ['Some Band'], 'Album')).toBe(false);
        expect(validateMusicBrainzMatch('Eagles', 'Hell Freezes Over (Live)', ['Eagles'], 'Hell Freezes Over', ['Compilation'])).toBe(false);
    });

    // Nothing is left to score once normalised, so only the same name matches
    it('matches names too short or too far from Latin letters to score', () => {
        expect(validateMusicBrainzMatch('Beyoncé', '4', ['Beyoncé'], '4')).toBe(true);
        expect(validateMusicBrainzMatch('Ed Sheeran', '+', ['Ed Sheeran'], '+')).toBe(true);
        expect(validateMusicBrainzMatch('MØ', 'No Mythologies to Follow', ['MØ'], 'No Mythologies to Follow')).toBe(true);
        expect(validateMusicBrainzMatch('Кино', '45', ['Кино'], '45')).toBe(true);
    });

    it('does not let two names that both normalise to nothing match each other', () => {
        expect(validateMusicBrainzMatch('Кино', '45', ['Аквариум'], '45')).toBe(false);
        expect(validateMusicBrainzMatch('Beyoncé', '4', ['Beyoncé'], '5')).toBe(false);
    });

    // A sequel is one character from the original, well inside 0.8
    it('rejects a release group with another number in its title', () => {
        expect(validateMusicBrainzMatch('Guns N\' Roses', 'Use Your Illusion I', ['Guns N\' Roses'], 'Use Your Illusion II')).toBe(false);
        expect(validateMusicBrainzMatch('Lil Wayne', 'Tha Carter III', ['Lil Wayne'], 'Tha Carter IV')).toBe(false);
        expect(validateMusicBrainzMatch('Eminem', 'The Marshall Mathers LP', ['Eminem'], 'The Marshall Mathers LP 2')).toBe(false);
    });

    // Both titles lose their labels before the compare, so a suffix that is not a label must survive on each
    it('tells apart titles that differ only after a dash', () => {
        expect(validateMusicBrainzMatch('Some Band', 'Album - 2', ['Some Band'], 'Album - 3')).toBe(false);
        expect(validateMusicBrainzMatch('Кино', 'Кино - Группа крови', ['Кино'], 'Кино - Звезда')).toBe(false);
        expect(validateMusicBrainzMatch('Кино', 'Кино - Группа крови', ['Кино'], 'Кино - Группа крови')).toBe(true);
    });

    it('reads a number the same whether written as a digit, a word or a numeral', () => {
        expect(validateMusicBrainzMatch('Queen', 'Greatest Hits II', ['Queen'], 'Greatest Hits 2')).toBe(true);
        expect(validateMusicBrainzMatch('Various Artists', 'The Very Best of the Eighties Volume Two', ['Various Artists'], 'The Very Best of the Eighties Volume 2')).toBe(true);
    });
});
