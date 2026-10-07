import { albumBaseTitle } from '../music/albumBaseTitle';
import { compareTitles } from '../music/compareTitles';

/**
 * Whether a MusicBrainz release group is the album. Artist and album are judged on
 * their own: one long title in a joined string carried a wrong artist or release group past.
 */
export function validateMusicBrainzMatch(artistName: string, albumName: string, mbArtistNames: string[], mbAlbumName: string, threshold: number = 0.8) {
    // Any credited name will do: collaborators come in any order, and a renamed act is credited under either name
    const artistMatches = mbArtistNames.some(name => compareTitles(artistName, name).similarity >= threshold);
    const { similarity } = compareTitles(albumBaseTitle(albumName), albumBaseTitle(mbAlbumName));

    return artistMatches && similarity >= threshold;
}
