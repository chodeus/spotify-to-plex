import { describe, expect, it } from 'vitest';
import { versionsMatch } from './compareVersions';

// The noise words configured on the instance these cases were measured against
const FILTER_OUT_WORDS = [
    'original mix', 'radio edit', 'single edit', 'alternate mix',
    'remastered', 'remaster', 'single version', 'retail mix', 'quartet'
];

const match = (plexTitle: string, spotifyTitle: string, credits: string[] = []) =>
    versionsMatch(plexTitle, spotifyTitle, FILTER_OUT_WORDS, credits).match;

// Every pair below was taken from cached links on a live library, where the
// match was checked by hand before being written down as right or wrong.
describe('versionsMatch', () => {

    describe('accepts titles that name the same recording', () => {

        it('reads a collaborator as a credit, not a version', () => {
            expect(match('Ready to Fly', 'Ready To Fly - Sub Focus & Dimension', ['Sub Focus', 'Dimension'])).toBe(true);
            expect(match('Desire', 'Desire (Sub Focus & Dimension)', ['Sub Focus', 'Dimension'])).toBe(true);
            expect(match('Illuminate', 'Illuminate - Sub Focus & Wilkinson', ['Sub Focus', 'Wilkinson'])).toBe(true);
            expect(match('Run Up', 'Run Up (Unknown T)', ['Chase & Status', 'Unknown T'])).toBe(true);
        });

        it('reads acts joined by "Vs." and "&" as the same set of credits', () => {
            expect(match('Arcade - Original Mix', 'Arcade (Dimitri Vegas & Like Mike Vs.W&W)', ['Dimitri Vegas & Like Mike', 'W&W'])).toBe(true);
        });

        it('ignores a track number left in a Plex tag', () => {
            expect(match('03 - Stronger', 'Stronger', ['Kanye West'])).toBe(true);
        });

        it('ignores a qualifier that only says "version"', () => {
            expect(match('Fear of the Dark', 'Fear Of The Dark - 1998 Remastered Version', ['Iron Maiden'])).toBe(true);
            expect(match('Black Skinhead (Digital Album Version (Explicit))', 'Black Skinhead', ['Kanye West'])).toBe(true);
        });

        it('accepts a version stated outside the brackets', () => {
            expect(match('The Island, Pt. II: Dusk', 'The Island, Pt. II (Dusk)', ['Pendulum'])).toBe(true);
            expect(match('The Island, Pt. I: Dawn', 'The Island, Pt. I (Dawn)', ['Pendulum'])).toBe(true);
            expect(match('Feel for You VIP', 'Feel for You - VIP', ['Bladerunner'])).toBe(true);
        });
    });

    describe('rejects titles that name different recordings', () => {

        it('rejects a remix offered for the original', () => {
            expect(match('Cinema', 'Cinema (Skrillex Remix) [feat. Gary Go]', ['Benny Benassi'])).toBe(false);
            expect(match('Make Luv', 'Make Luv - Live', ['Room 5', 'Oliver Cheatham'])).toBe(false);
            expect(match('Dream Bigger', 'Dream Bigger - Instrumental', ['Axwell /\\ Ingrosso'])).toBe(false);
            expect(match('The Hum', 'The Hum - Short Edit', ['Dimitri Vegas & Like Mike'])).toBe(false);
            expect(match('Overdrive', 'Overdrive (feat. Norma Jean Martine) - Acoustic Version', ['Ofenbach', 'Norma Jean Martine'])).toBe(false);
            expect(match('Decode', 'Decode - Twilight Soundtrack Version', ['Paramore'])).toBe(false);
        });

        it('rejects the original offered for a remix', () => {
            expect(match('Swimming Pools (Drank) (Black Hippy remix)', 'Swimming Pools (Drank)', ['Kendrick Lamar'])).toBe(false);
            expect(match('Tipsy (clean)', 'Tipsy - Club Mix', ['J-Kwon'])).toBe(false);
        });

        // The remixer is usually credited on the track too, so a credit has to be
        // matched whole - treating it as a substring would accept every remix
        it('still rejects a remix named after a credited artist', () => {
            expect(match('REACT', 'REACT (feat. Ella Henderson) - Culture Shock Remix', ['Switch Disco', 'Ella Henderson', 'Culture Shock'])).toBe(false);
            expect(match('DJ Turn It Up', 'DJ Turn It Up - Ben Nicky Remix', ['Dimension', 'Ben Nicky'])).toBe(false);
        });

        // Credits are the wanted track's own. A candidate whose artist tag names
        // the collaborator must not thereby licence its own qualifier
        it('rejects a collaboration offered for the plain track', () => {
            expect(match('Return of the Mack (Mark Morrison vs. Bad Royale)', 'Return of the Mack', ['Mark Morrison'])).toBe(false);
        });

        // Spotify names the live album in the title, Plex leaves it to the album
        // tag. Nothing in the titles can tell these apart, so they stay rejected
        it('rejects a live take whose album carries the only clue', () => {
            expect(match('Enter Sandman', 'Enter Sandman (Live with the SFSO)', ['Metallica'])).toBe(false);
        });
    });

    it('treats a missing title as no answer rather than a match', () => {
        expect(versionsMatch('', 'Cinema (Skrillex Remix)', FILTER_OUT_WORDS).match).toBe(false);
    });
});
