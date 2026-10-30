import { compareTitles } from '@spotify-to-plex/shared-utils/music/compareTitles';
import { durationsDiffer } from '@spotify-to-plex/shared-utils/music/durationSimilarity';
import { Track } from '../types/Track';
import { compareVersions, titleName } from './compareVersions';

/** The candidate is the wanted track in the wanted edit: the same act, name, version and length. */
export function isWantedEdit(wanted: Pick<Track, 'title' | 'originalTitle' | 'artist' | 'artists' | 'duration_ms'>, candidate: Pick<Track, 'title' | 'artist' | 'duration_ms'>) {
    const title = wanted.originalTitle ?? wanted.title;
    const credits = wanted.artists ?? [wanted.artist];
    // A title of nothing but non-Latin text reduces to '', which would make every such pair one name
    const name = titleName(title);
    // A filter may not ask for the artist ("title:contains"), so another act's same-named copy can reach here
    const sameAct = credits.some(credit => {
        const { match, contains } = compareTitles(candidate.artist, credit, true);

        return match || contains;
    });

    return sameAct
        && name !== ''
        && name === titleName(candidate.title)
        && !durationsDiffer(wanted.duration_ms, candidate.duration_ms)
        && compareVersions(candidate.title, title, credits).match;
}
