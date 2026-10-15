import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getStorageDir } from "@spotify-to-plex/shared-utils/utils/getStorageDir";

/** Spotify ids in the last written missing_tracks_spotify.txt; empty before the first one. */
export function readMissingSpotifyTrackIds() {
    const path = join(getStorageDir(), 'missing_tracks_spotify.txt');
    if (!existsSync(path))
        return new Set<string>();

    return new Set(readFileSync(path, 'utf8')
        .split('\n')
        .map(line => line.trim().split('/track/')[1])
        .filter((id): id is string => !!id));
}
