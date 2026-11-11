import { isSyncRunning } from "@spotify-to-plex/shared-utils/utils/syncLock";
import { withoutHandMatched } from "../utils/handMatches";
import { writeMissingLists } from "../utils/missingLists";
import { ALBUMS_STATE_FILE, PLAYLISTS_STATE_FILE, rewriteSyncState } from "../utils/syncState";

const JOBS = [
    { job: 'playlists', file: PLAYLISTS_STATE_FILE, kind: 'track' },
    { job: 'albums', file: ALBUMS_STATE_FILE, kind: 'album' }
] as const;

/** Takes hand-matched tracks off this app's own missing lists now; Lidarr and slskd are never touched. */
export function forgetHandMatchedTracks() {
    for (const { job, file, kind } of JOBS) {
        // A running sync takes them off itself when it ends, and would write over an edit made now. Not
        // its lock: a sync starting meanwhile would be refused and lose its whole run
        if (isSyncRunning(job))
            continue;

        const lists = rewriteSyncState(file, withoutHandMatched(kind));
        if (lists)
            writeMissingLists(kind, lists);
    }
}
