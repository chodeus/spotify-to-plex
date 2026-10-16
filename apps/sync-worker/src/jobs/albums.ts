import { searchAlbum } from "@spotify-to-plex/plex-music-search/functions/searchAlbum";
import { SearchResponse } from "@spotify-to-plex/plex-music-search/types/SearchResponse";
import { getMusicSearchConfig } from "@spotify-to-plex/music-search/functions/getMusicSearchConfig";
import { getCachedPlexTracks } from "../utils/getCachedPlexTracks";
import { getSavedAlbums } from "../utils/getSavedAlbums";
import { getNestedSyncLogsForType } from "../utils/getNestedSyncLogsForType";
import { startSyncType } from "../utils/startSyncType";
import { clearSyncTypeLogs } from "../utils/clearSyncTypeLogs";
import { completeSyncType } from "../utils/completeSyncType";
import { hasNothingEnrolled } from "../utils/hasNothingEnrolled";
import { errorSyncType } from "../utils/errorSyncType";
import { updateSyncTypeProgress } from "../utils/updateSyncTypeProgress";
import { loadSpotifyData } from "../utils/loadSpotifyData";
import { getSettings } from "@spotify-to-plex/plex-config/functions/getSettings";
import { emptyMissingLists, missingAlbumListsFor, writeMissingLists } from "../utils/missingLists";
import { clearSyncState, openSyncState } from "../utils/syncState";

const STATE_FILE = 'albums_sync_state.json';

/** Syncs every enrolled album that is due; force syncs them all, whatever their interval. */
export async function syncAlbums(force = process.argv.slice(2).includes("force")) {
    // Start sync type logging
    startSyncType('albums');
    clearSyncTypeLogs('albums');

    try {

        const { toSyncAlbums } = getSavedAlbums()
        if (hasNothingEnrolled(toSyncAlbums, 'albums', 'albums')) {
            // Nothing enrolled means nothing missing. Clear this job's own
            // outputs, or a deleted album sits in the Lidarr queue forever -
            // the Lidarr and SLSKD jobs merge these files with the playlist ones every run.
            writeMissingLists('album', emptyMissingLists())
            clearSyncState(STATE_FILE)

            return;
        }

        const { putLog, logError, logComplete } = getNestedSyncLogsForType('albums')

        const settings = await getSettings();
        if (!settings.uri || !settings.token)
            throw new Error("No plex connection found")

        const syncState = openSyncState(STATE_FILE)

        for (let i = 0; i < toSyncAlbums.length; i++) {
            const item = toSyncAlbums[i];
            if (!item)
                continue;

            // Update progress
            updateSyncTypeProgress('albums', i + 1, toSyncAlbums.length);

            const { id, title, uri, user, sync_interval } = item;
            let days = Number(sync_interval)
            if (isNaN(days))
                days = 0;

            // The run's logs are cleared above, so the last sync time comes from the stored state
            const nextSync = force ? undefined : syncState.notDueUntil(id, days)
            if (nextSync) {
                console.log(`Next sync on: ${nextSync.toDateString()}`)
                continue;
            }

            //////////////////////////////////
            // Load Plex playlist
            //////////////////////////////////
            const itemLog = putLog(id, title)

            //////////////////////////////////
            // Load Spotify Data
            //////////////////////////////////
            const data = await loadSpotifyData(uri, user)
            if (!data) {
                logError(itemLog, `Spotify data could not be loaded`)
                continue;
            }

            //////////////////////////////////////
            // Load music search configuration and search
            //////////////////////////////////////
            const musicSearchConfig = await getMusicSearchConfig();

            const { searchApproaches } = musicSearchConfig;
            if (!searchApproaches || searchApproaches.length === 0)
                throw new Error(`Search approaches not found`)

            const plexConfig = {
                uri: settings.uri,
                token: settings.token,
                musicSearchConfig,
                searchApproaches
            };
            const result = await searchAlbum(plexConfig, data.tracks);

            //@ts-ignore
            const { add } = await getCachedPlexTracks(plexConfig, data);

            const missingTracks = data.tracks.filter(item => {
                const { title: trackTitle, artists: trackArtists } = item;

                return result.some((track: SearchResponse) => track.title == trackTitle && trackArtists.indexOf(track.artist) > - 1 && track.result.length == 0)
            })
            if (!result.some((item: SearchResponse) => item.result.length == 0)) {
                syncState.record(id, emptyMissingLists())
                logComplete(itemLog);

                // Store album id
                add(result, 'plex', { id: data.id })
                continue;
            }

            console.log(`Some tracks on the album seem to be missing ${data.tracks.length}/ ${missingTracks.length}: ${data.title}`)
            syncState.record(id, await missingAlbumListsFor(data.id, missingTracks))

            /////////////////////////////
            // Store logs
            /////////////////////////////
            logComplete(itemLog)
        }

        // Built from every enrolled album's last sync, so one skipped or failed this run stays on the
        // lists; until any album has synced, the last lists stand
        const lists = syncState.settle(toSyncAlbums)
        if (lists)
            writeMissingLists('album', lists)

        // Mark sync as complete
        completeSyncType('albums');
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        errorSyncType('albums', message);
        throw e;
    }
}


function run() {
    console.log(`Start syncing items`)
    syncAlbums()
        .then(() => {
            console.log(`Sync complete`)
        })
        .catch((e: unknown) => {
            console.log(e)
        })
}

// Only run if this file is executed directly, not when imported
// eslint-disable-next-line unicorn/prefer-module
if (require.main === module) {
    run();
}