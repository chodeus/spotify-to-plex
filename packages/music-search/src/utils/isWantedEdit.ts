import { durationsDiffer } from '@spotify-to-plex/shared-utils/music/durationSimilarity';
import { Track } from '../types/Track';
import { compareVersions, titleName } from './compareVersions';

/** The candidate is the wanted track in the wanted edit: the same name, version and length. */
export function isWantedEdit(wanted: Pick<Track, 'title' | 'originalTitle' | 'artist' | 'artists' | 'duration_ms'>, candidate: Pick<Track, 'title' | 'duration_ms'>) {
    const title = wanted.originalTitle ?? wanted.title;
    // A title of nothing but non-Latin text reduces to '', which would make every such pair one name
    const name = titleName(title);

    return name !== ''
        && name === titleName(candidate.title)
        && !durationsDiffer(wanted.duration_ms, candidate.duration_ms)
        && compareVersions(candidate.title, title, wanted.artists ?? [wanted.artist]).match;
}
