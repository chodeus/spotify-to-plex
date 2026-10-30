import { durationsDiffer } from '@spotify-to-plex/shared-utils/music/durationSimilarity';
import { Track } from '../types/Track';
import { titleName } from './compareVersions';

/** The candidate's name is the wanted name with words added, at another length: "Other Paper Lanterns" is not "Paper Lanterns". */
export function namesAnotherSong(wanted: Pick<Track, 'title' | 'originalTitle' | 'duration_ms'>, candidate: Pick<Track, 'title' | 'duration_ms'>) {
    const name = titleName(wanted.originalTitle ?? wanted.title);
    const candidateName = titleName(candidate.title);

    return candidateName !== name
        && ` ${candidateName} `.includes(` ${name} `)
        && durationsDiffer(wanted.duration_ms, candidate.duration_ms);
}
