import { runExclusive } from "@spotify-to-plex/shared-utils/utils/syncLock";
import { syncAlbums } from "./albums";
import { syncLidarr } from "./lidarr";
import { syncMQTT } from "./mqtt";
import { syncPlaylists } from "./playlists";
import { syncSlskd } from "./slskd";
import { syncUsers } from "./users";

/** Runs the syncs in turn under one "all" lock, stopping at the first that fails */
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
