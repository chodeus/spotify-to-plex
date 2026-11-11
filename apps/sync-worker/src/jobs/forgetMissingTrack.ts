import { getCachedTrackLinks } from "@spotify-to-plex/shared-utils/cache/getCachedTrackLink";
import { runExclusive } from "@spotify-to-plex/shared-utils/utils/syncLock";
import { withoutTrack, writeMissingLists } from "../utils/missingLists";
import { ALBUMS_STATE_FILE, PLAYLISTS_STATE_FILE, rewriteSyncState } from "../utils/syncState";

const JOBS = [
    { job: 'playlists', file: PLAYLISTS_STATE_FILE, kind: 'track' },
    { job: 'albums', file: ALBUMS_STATE_FILE, kind: 'album' }
] as const;

/**
 * Takes a track matched by hand off this app's own missing lists now, rather than when its playlist next
 * syncs. Only those files change: nothing in Lidarr or slskd is touched.
 */
export async function forgetMissingTrack(spotifyId: string) {
    const [link] = getCachedTrackLinks([{ id: spotifyId, artists: [], title: '' }], 'tidal').found;
    const tidalIds = link?.tidal_id ?? [];

    for (const { job, file, kind } of JOBS) {
        // Under the job's lock, so a sync cannot write over the edit or start halfway through it
        const done = await runExclusive(job, async () => {
            const lists = rewriteSyncState(file, missing => withoutTrack(missing, kind, spotifyId, tidalIds));
            if (lists)
                writeMissingLists(kind, lists);

            return true;
        });

        // The running sync writes its own lists when it ends; the match counts from its next run
        if (!done)
            console.log(`The ${job} sync is running: the hand-matched track leaves its missing lists at the next run`);
    }
}
