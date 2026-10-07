import { albumBaseTitle, albumEdition } from '../music/albumBaseTitle';
import { compareTitles } from '../music/compareTitles';
import { createSearchString } from '../music/createSearchString';

const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'];

// "Use Your Illusion I" and "II" are one letter apart, which no similarity threshold can see
function numbersIn(title: string) {
    return (title.toLowerCase().match(/[\da-z]+/g) ?? [])
        .map(word => (/^\d+$/.test(word) ? String(Number(word)) : String(NUMBER_WORDS.indexOf(word) + 1 || ROMAN.indexOf(word) + 1 || '')))
        .filter(Boolean)
        .sort()
        .join(' ');
}

const folded = (name: string) => name.normalize('NFKC')
    .toLowerCase()
    .trim();

// Under two letters once normalised ("4", "+", "MØ", "Кино") there is nothing to score, so only the same name matches
function similar(a: string, b: string, threshold: number) {
    if (createSearchString(a).length < 2 || createSearchString(b).length < 2)
        return folded(a) === folded(b);

    return compareTitles(a, b).similarity >= threshold;
}

/**
 * Whether a MusicBrainz release group is the album. Artist and album are judged on
 * their own: one long title in a joined string carried a wrong artist or release group past.
 */
export function validateMusicBrainzMatch(artistName: string, albumName: string, mbArtistNames: string[], mbAlbumName: string, mbSecondaryTypes: string[] = [], threshold: number = 0.8) {
    // Any credited name will do: collaborators come in any order, and a renamed act is credited under either name
    const artistMatches = mbArtistNames.some(name => similar(artistName, name, threshold));
    const album = albumEdition(albumName);
    const mbAlbum = albumBaseTitle(mbAlbumName);

    // MusicBrainz marks a live album with the Live type rather than "(Live)" in its title
    if (album.live && !mbSecondaryTypes.includes('Live'))
        return false;

    return artistMatches && numbersIn(album.base) === numbersIn(mbAlbum) && similar(album.base, mbAlbum, threshold);
}
