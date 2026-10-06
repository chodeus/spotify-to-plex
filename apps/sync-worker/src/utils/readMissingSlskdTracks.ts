import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getStorageDir } from "@spotify-to-plex/shared-utils/utils/getStorageDir";
import { SlskdTrackData } from "@spotify-to-plex/shared-types/slskd/SlskdTrackData";

// One file per job, so the albums job cannot overwrite the playlists job's queue
const QUEUE_FILES = ['missing_tracks_slskd.json', 'missing_albums_slskd.json'];

/** Both jobs' missing tracks, one per Spotify id; throws when a file does not parse. */
export function readMissingSlskdTracks() {
    const tracks = new Map<string, SlskdTrackData>();

    for (const file of QUEUE_FILES) {
        const path = join(getStorageDir(), file);
        if (!existsSync(path))
            continue;

        let parsed: unknown;
        try {
            parsed = JSON.parse(readFileSync(path, 'utf8'));
        } catch (_e) {
            throw new Error(`Failed to parse ${file}`);
        }

        if (!Array.isArray(parsed))
            continue;

        for (const track of parsed as SlskdTrackData[])
            tracks.set(track.spotify_id, track);
    }

    return [...tracks.values()];
}
