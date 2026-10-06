import { getIsrcCache, IsrcRecording } from '../cache/getIsrcCache';
import { musicBrainzGet } from '../lidarr/utils/musicBrainzGet';

type MusicBrainzRecording = {
    id: string;
    length?: number;
    releases?: {
        title?: string;
        media?: {
            track?: { id: string }[];
        }[];
    }[];
};

type RecordingSearchResponse = {
    recordings?: MusicBrainzRecording[];
};

/** "not-found": no recording fits (or the ISRC is malformed); "unavailable": the request failed, remember nothing. */
export type IsrcLookup =
    | { status: 'found'; trackIds: string[]; releaseTitles: string[] }
    | { status: 'not-found' }
    | { status: 'unavailable' };

const ISRC_PATTERN = /^[A-Z]{2}[\dA-Z]{3}\d{7}$/;

// Room for one recording's length to differ between sources; a separate edit usually falls outside it
const SAME_RECORDING_WITHIN_MS = 10_000;

function toRecording(recording: MusicBrainzRecording): IsrcRecording {
    const releases = recording.releases ?? [];

    return {
        length: recording.length,
        track_ids: releases
            .flatMap(release => release.media ?? [])
            .flatMap(medium => medium.track ?? [])
            .map(track => track.id),
        release_titles: releases
            .map(release => release.title)
            .filter((title): title is string => !!title)
    };
}

// Labels put one ISRC on a radio edit and the album cut alike; the length tells them apart
function toLookup(recordings: IsrcRecording[], durationMs?: number): IsrcLookup {
    const fitting = recordings.filter(recording => !recording.length || !durationMs || Math.abs(recording.length - durationMs) <= SAME_RECORDING_WITHIN_MS);
    const trackIds = [...new Set(fitting.flatMap(recording => recording.track_ids))];
    const releaseTitles = [...new Set(fitting.flatMap(recording => recording.release_titles))];

    return trackIds.length > 0
        ? { status: 'found', trackIds, releaseTitles }
        : { status: 'not-found' };
}

/** Track ids and release titles for the recordings carrying this ISRC whose length fits `durationMs`. */
export async function getMusicBrainzTrackIdsByIsrc(isrc: string, durationMs?: number): Promise<IsrcLookup> {
    const normalized = isrc.trim().toUpperCase();
    if (!ISRC_PATTERN.test(normalized))
        return { status: 'not-found' };

    const cache = getIsrcCache();
    const cached = cache.get(normalized);
    if (cached)
        return toLookup(cached.recordings, durationMs);

    let data: RecordingSearchResponse;
    try {
        // The recording search lists each release's track ids; the /isrc lookup does not
        ({ data } = await musicBrainzGet<RecordingSearchResponse>(`https://musicbrainz.org/ws/2/recording?query=isrc:${normalized}&fmt=json&limit=25`));
    } catch (_e: unknown) {
        return { status: 'unavailable' };
    }

    const recordings = (data.recordings ?? []).map(toRecording);
    cache.add(normalized, recordings);

    return toLookup(recordings, durationMs);
}
