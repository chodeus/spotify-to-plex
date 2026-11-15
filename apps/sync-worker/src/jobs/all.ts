import { runExclusive } from "@spotify-to-plex/shared-utils/utils/syncLock";
import { syncAlbums } from "./albums";
import { syncLidarr } from "./lidarr";
import { syncMQTT } from "./mqtt";
import { syncPlaylists } from "./playlists";
import { syncSlskd } from "./slskd";
import { syncUsers } from "./users";

/**
 * Runs every sync in turn, holding its own lock for the whole sequence. Each sync only locks
 * itself, so without this a second "all" started between steps would run alongside the first.
 * Returns undefined, without starting, when a run of it is already going.
 */
export async function syncAll() {
    return runExclusive('all', async () => {
        await syncUsers();
        // A sync started by hand is not held back by an album's or playlist's interval
        await syncAlbums(true);
        await syncPlaylists(true);
        await syncLidarr();
        await syncMQTT();
        await syncSlskd();

        return true;
    });
}
