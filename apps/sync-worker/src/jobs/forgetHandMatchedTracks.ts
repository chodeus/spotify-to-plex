import { isSyncRunning } from "@spotify-to-plex/shared-utils/utils/syncLock";
import { withoutHandMatched } from "../utils/handMatches";
import { writeMissingLists } from "../utils/missingLists";
import { ALBUMS_STATE_FILE, PLAYLISTS_STATE_FILE, rewriteSyncState } from "../utils/syncState";

const JOBS = [
    { job: 'playlists', file: PLAYLISTS_STATE_FILE, kind: 'track' },
    { job: 'albums', file: ALBUMS_STATE_FILE, kind: 'album' }
] as const;

const RETRY_MS = 15_000;
// Longer than any sync runs; a later sync takes the tracks off by itself anyway
const GIVE_UP_AFTER_MS = 2 * 60 * 60 * 1000;

function rewriteLists(target: typeof JOBS[number], deadline: number) {
    const { job, file, kind } = target;
    // A running sync writes over an edit made now, and may have read the hand matches before this one was saved
    if (isSyncRunning(job)) {
        if (Date.now() < deadline)
            setTimeout(() => rewriteLists(target, deadline), RETRY_MS).unref();

        return;
    }

    const lists = rewriteSyncState(file, withoutHandMatched(kind));
    if (lists)
        writeMissingLists(kind, lists);
}

/** Takes hand-matched tracks off this app's own missing lists, once any running sync ends; Lidarr and slskd are never touched. */
export function forgetHandMatchedTracks() {
    const deadline = Date.now() + GIVE_UP_AFTER_MS;

    for (const job of JOBS)
        rewriteLists(job, deadline);
}
