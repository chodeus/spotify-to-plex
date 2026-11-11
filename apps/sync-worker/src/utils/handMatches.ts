import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getStorageDir } from "@spotify-to-plex/shared-utils/utils/getStorageDir";
import type { TrackLink } from "@spotify-to-plex/shared-types/common/track";
import { MissingLists, withoutTrack } from "./missingLists";
import { spotifyTrackId } from "./spotifyTrackId";

/** The hand-matched tracks' bare Spotify ids, and every linked track's Tidal ids by bare id. */
function readHandMatches() {
    const path = join(getStorageDir(), 'track_links.json');
    if (!existsSync(path))
        return { matched: [], tidalOf: new Map<string, string[]>() };

    try {
        const links = JSON.parse(readFileSync(path, 'utf8')) as TrackLink[];
        const bareId = (link: TrackLink) => spotifyTrackId(link.spotify_id) ?? link.spotify_id;

        return {
            matched: links.filter(link => link.manual && link.plex_id && link.plex_id.length > 0).map(bareId),
            tidalOf: new Map(links.map(link => [bareId(link), link.tidal_id ?? []]))
        };
    } catch (e) {
        // The lists stay as they are; the next readable run takes the matches off
        console.error('Error reading track_links.json for hand matches:', e);

        return { matched: [], tidalOf: new Map<string, string[]>() };
    }
}

/** Takes every hand-matched track off one item's lists; the lists are the source, never Lidarr or slskd. */
export function withoutHandMatched(kind: 'track' | 'album') {
    const { matched, tidalOf } = readHandMatches();

    return (lists: MissingLists) => {
        let result: MissingLists | undefined;

        for (const spotifyId of matched) {
            const current = result ?? lists;
            // A Tidal link another listed track still needs stays, as the same recording can be listed twice
            const needed = new Set(current.slskd.filter(track => track.spotify_id != spotifyId).flatMap(track => tidalOf.get(track.spotify_id) ?? []));
            const tidalIds = (tidalOf.get(spotifyId) ?? []).filter(id => !needed.has(id));
            result = withoutTrack(current, kind, spotifyId, tidalIds) ?? result;
        }

        return result;
    };
}
