import { durationsDiffer } from '@spotify-to-plex/shared-utils/music/durationSimilarity';
import { Track } from '../types/Track';
import { titleName, withoutWords } from './compareVersions';

/** The candidate's name puts words in front of the wanted name, at another length: "Other Paper Lanterns" is not "Paper Lanterns". */
export function namesAnotherSong(wanted: Pick<Track, 'title' | 'originalTitle' | 'duration_ms'>, candidate: Pick<Track, 'title' | 'duration_ms'>, filterOutWords: string[] = []) {
    // Noise words are no part of a name: a filtered query reads "Paper Lanterns Radio Edit" as "paper lanterns"
    const nameOf = (title: string) => titleName(withoutWords(title, filterOutWords));
    const name = nameOf(wanted.originalTitle ?? wanted.title);
    const candidateName = nameOf(candidate.title);

    // From index 1: words after the name may be an edit a tag writes without brackets ("Paper Lanterns Radio Edit")
    return ` ${candidateName} `.includes(` ${name} `, 1)
        && durationsDiffer(wanted.duration_ms, candidate.duration_ms);
}
