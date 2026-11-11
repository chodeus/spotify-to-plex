import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getStorageDir } from "@spotify-to-plex/shared-utils/utils/getStorageDir";
import type { TrackLink } from "@spotify-to-plex/shared-types/common/track";
import { MissingLists, withoutTrack } from "./missingLists";
import { spotifyTrackId } from "./spotifyTrackId";

/** Each hand-matched track's bare Spotify id, with its Tidal ids. */
function readHandMatches() {
    const path = join(getStorageDir(), 'track_links.json');
    if (!existsSync(path))
        return new Map<string, string[]>();

    try {
        const links = JSON.parse(readFileSync(path, 'utf8')) as TrackLink[];

        return new Map(links
            .filter(link => link.manual && link.plex_id && link.plex_id.length > 0)
            .map(link => [spotifyTrackId(link.spotify_id) ?? link.spotify_id, link.tidal_id ?? []]));
    } catch (e) {
        // The lists stay as they are; the next readable run takes the matches off
        console.error('Error reading track_links.json for hand matches:', e);

        return new Map<string, string[]>();
    }
}

/** Takes every hand-matched track off one item's lists; the lists are the source, never Lidarr or slskd. */
export function withoutHandMatched(kind: 'track' | 'album') {
    const matches = readHandMatches();

    return (lists: MissingLists) => {
        let result: MissingLists | undefined;

        for (const [spotifyId, tidalIds] of matches)
            result = withoutTrack(result ?? lists, kind, spotifyId, tidalIds) ?? result;

        return result;
    };
}
