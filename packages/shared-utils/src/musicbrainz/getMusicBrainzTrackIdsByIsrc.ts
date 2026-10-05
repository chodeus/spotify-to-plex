import { getIsrcCache } from '../cache/getIsrcCache';
import { musicBrainzGet } from '../lidarr/utils/musicBrainzGet';

type RecordingSearchResponse = {
    recordings?: {
        id: string;
        releases?: {
            title?: string;
            media?: {
                track?: { id: string }[];
            }[];
        }[];
    }[];
};

/**
 * "not-found" means MusicBrainz answered with no recording; "unavailable" means
 * the request failed and nothing may be remembered about it.
 */
export type IsrcLookup =
    | { status: 'found'; trackIds: string[]; releaseTitles: string[] }
    | { status: 'not-found' }
    | { status: 'unavailable' };

const ISRC_PATTERN = /^[A-Z]{2}[\dA-Z]{3}\d{7}$/;

function toLookup(trackIds: string[], releaseTitles: string[]): IsrcLookup {
    return trackIds.length > 0
        ? { status: 'found', trackIds, releaseTitles }
        : { status: 'not-found' };
}

/**
 * Every MusicBrainz track id (one per release a recording appears on) for the
 * recordings carrying this ISRC, plus those releases' titles.
 */
export async function getMusicBrainzTrackIdsByIsrc(isrc: string): Promise<IsrcLookup> {
    const normalized = isrc.trim().toUpperCase();
    if (!ISRC_PATTERN.test(normalized))
        return { status: 'not-found' };

    const cache = getIsrcCache();
    const cached = cache.get(normalized);
    if (cached)
        return toLookup(cached.track_ids, cached.release_titles);

    let data: RecordingSearchResponse;
    try {
        // The recording search lists each release's track ids; the /isrc lookup does not
        ({ data } = await musicBrainzGet<RecordingSearchResponse>(`https://musicbrainz.org/ws/2/recording?query=isrc:${normalized}&fmt=json&limit=25`));
    } catch (_e: unknown) {
        return { status: 'unavailable' };
    }

    const releases = (data.recordings ?? []).flatMap(recording => recording.releases ?? []);
    const trackIds = [...new Set(releases
        .flatMap(release => release.media ?? [])
        .flatMap(medium => medium.track ?? [])
        .map(track => track.id))];
    const releaseTitles = [...new Set(releases
        .map(release => release.title)
        .filter((title): title is string => !!title))];

    cache.add(normalized, trackIds, releaseTitles);

    return toLookup(trackIds, releaseTitles);
}
