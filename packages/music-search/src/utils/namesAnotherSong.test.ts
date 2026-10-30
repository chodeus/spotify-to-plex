import { describe, expect, it } from 'vitest';
import { namesAnotherSong } from './namesAnotherSong';

const wanted = (title: string, seconds?: number) => ({ title, duration_ms: seconds && seconds * 1000 });
const candidate = (title: string, seconds?: number) => ({ title, duration_ms: seconds && seconds * 1000 });

describe('namesAnotherSong', () => {

    it('reads a name that puts words in front of the wanted one, at another length, as another song', () => {
        expect(namesAnotherSong(wanted('Paper Lanterns', 330), candidate('Other Paper Lanterns', 256))).toBe(true);
        expect(namesAnotherSong(wanted('Paper Lanterns', 330), candidate('Other Paper Lanterns Forever', 256))).toBe(true);
    });

    it('leaves words after the wanted name to the filters, as tags write an edit without brackets', () => {
        expect(namesAnotherSong(wanted('Paper Lanterns', 300), candidate('Paper Lanterns Radio Edit', 210))).toBe(false);
        expect(namesAnotherSong(wanted('Paper Lanterns', 330), candidate('Paper Lanterns Forever', 256))).toBe(false);
    });

    it('reads both names without their qualifiers', () => {
        expect(namesAnotherSong(wanted('Paper Lanterns - Radio Edit', 210), candidate('Other Paper Lanterns (Radio Edit)', 256))).toBe(true);
    });

    it('reads both names without the noise words a filtered query drops', () => {
        expect(namesAnotherSong(wanted('Paper Lanterns Radio Edit', 330), candidate('Other Paper Lanterns', 256), ['radio edit'])).toBe(true);
        expect(namesAnotherSong(wanted('Paper Lanterns', 330), candidate('Other Paper Lanterns Radio Edit', 256), ['radio edit'])).toBe(true);
    });

    it('never reads a noise word in front of the name as a title of its own', () => {
        expect(namesAnotherSong(wanted('Paper Lanterns', 330), candidate('Remastered Paper Lanterns', 256), ['remastered'])).toBe(false);
    });

    it('keeps a longer name at the wanted length', () => {
        expect(namesAnotherSong(wanted('Paper Lanterns', 330), candidate('Other Paper Lanterns', 325))).toBe(false);
    });

    it('keeps the same name at another length, which is another edit of the song', () => {
        expect(namesAnotherSong(wanted('Paper Lanterns', 300), candidate('Paper Lanterns (Radio Edit)', 210))).toBe(false);
    });

    it('matches the wanted name as whole words only', () => {
        expect(namesAnotherSong(wanted('Lanterns', 330), candidate('Paperlanterns', 256))).toBe(false);
    });

    it('reads the title Spotify gave, not the query an approach cut from it', () => {
        const cut = { title: 'paper lanterns', originalTitle: 'Other Paper Lanterns', duration_ms: 330_000 };

        expect(namesAnotherSong(cut, candidate('Other Paper Lanterns', 256))).toBe(false);
    });

    it('never judges without both lengths', () => {
        expect(namesAnotherSong(wanted('Paper Lanterns', 330), candidate('Other Paper Lanterns'))).toBe(false);
        expect(namesAnotherSong(wanted('Paper Lanterns'), candidate('Other Paper Lanterns', 256))).toBe(false);
    });

    it('never judges a wanted title of nothing but punctuation', () => {
        expect(namesAnotherSong(wanted('???', 330), candidate('Other ???', 256))).toBe(false);
    });

});
