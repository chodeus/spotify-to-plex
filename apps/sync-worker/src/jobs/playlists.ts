/* eslint-disable max-depth */
import { AxiosRequest } from "@spotify-to-plex/http-client/AxiosRequest";
import { getAPIUrl } from "@spotify-to-plex/shared-utils/utils/getAPIUrl";
import { handleOneRetryAttempt } from "@spotify-to-plex/plex-helpers/retry";
import { Playlist } from "@spotify-to-plex/shared-types/plex/Playlist";
import { GetPlaylistResponse } from "@spotify-to-plex/shared-types/plex/GetPlaylistResponse";
import { SearchResponse } from "@spotify-to-plex/plex-music-search/types/SearchResponse";
import { search as plexMusicSearch } from "@spotify-to-plex/plex-music-search/functions/search";
import { getMusicSearchConfig } from "@spotify-to-plex/music-search/functions/getMusicSearchConfig";
import { getCachedPlexTracks } from "../utils/getCachedPlexTracks";
import { mergeSearchResults } from "../utils/mergeSearchResults";
import { getPlexPlaylists } from "../utils/getPlexPlaylists";
import { getSavedPlaylists } from "../utils/getSavedPlaylists";
import { getNestedSyncLogsForType } from "../utils/getNestedSyncLogsForType";
import { startSyncType } from "../utils/startSyncType";
import { clearSyncTypeLogs } from "../utils/clearSyncTypeLogs";
import { completeSyncType } from "../utils/completeSyncType";
import { hasNothingEnrolled } from "../utils/hasNothingEnrolled";
import { errorSyncType } from "../utils/errorSyncType";
import { updateSyncTypeProgress } from "../utils/updateSyncTypeProgress";
import { loadSpotifyData } from "../utils/loadSpotifyData";
import { matchByIsrc } from "../utils/matchByIsrc";
import { putPlexPlaylist } from "../utils/putPlexTracks";
import { getSettings } from "@spotify-to-plex/plex-config/functions/getSettings";
import { findMissingTracks } from "../utils/findMissingTracks";
import { readMissingSpotifyTrackIds } from "../utils/readMissingSpotifyTrackIds";
import { mergeMissingLists, missingListsFor, writeMissingLists } from "../utils/missingLists";
import { notDueUntil, PlaylistSyncState, readPlaylistSyncState, savePlaylistSyncState } from "../utils/playlistSyncState";


/** Syncs every enrolled playlist that is due; force syncs them all, whatever their interval. */
export async function syncPlaylists(force = process.argv.slice(2).includes("force")) {
    // Start sync type logging
    startSyncType('playlists');
    clearSyncTypeLogs('playlists');

    try {

        const { toSyncPlaylists } = getSavedPlaylists()
        if (hasNothingEnrolled(toSyncPlaylists, 'playlists', 'playlists')) {
            // Same reason as the albums job: stale missing-track files would
            // keep feeding the Lidarr and slskd queues after the last playlist
            // was removed
            writeMissingLists(mergeMissingLists([]))
            savePlaylistSyncState({})

            return;
        }

        const { putLog, logError, logComplete } = getNestedSyncLogsForType('playlists')

        const settings = await getSettings();
        if (!settings.uri || !settings.token)
            throw new Error("No plex connection found")

        const { playlists } = await getPlexPlaylists()

        // Read before this run rewrites them
        const lastMissing = readMissingSpotifyTrackIds()
        const state = readPlaylistSyncState()
        const synced = new Map<string, PlaylistSyncState>()

        for (let i = 0; i < toSyncPlaylists.length; i++) {
            const item = toSyncPlaylists[i];
            if (!item)
                continue;

            // Update progress
            updateSyncTypeProgress('playlists', i + 1, toSyncPlaylists.length);

            const { id, title, uri, user, sync_interval } = item;
            let days = Number(sync_interval)
            if (isNaN(days))
                days = 0;

            // The run's logs are cleared above, so the last sync time comes from the stored state
            const nextSync = force ? undefined : notDueUntil(state[id], days)
            if (nextSync) {
                console.log(`Next sync on: ${nextSync.toString()}`)
                continue;
            }

            //////////////////////////////////
            // Load Plex playlist
            //////////////////////////////////
            const itemLog = putLog(id, title)

            try {

                //////////////////////////////////
                // Load Spotify Data
                //////////////////////////////////
                const data = await loadSpotifyData(uri, user)
                if (!data) {
                    logError(itemLog, `Spotify data could not be loaded`)
                    continue;
                }

                console.log(`---- Syncing ${data.title} ----`)
                //////////////////////////////////
                // Load Plex Playlists if it exists
                //////////////////////////////////
                // eslint-disable-next-line unicorn/consistent-destructuring
                const foundPlaylist = playlists.find(item => item.id == id)
                let plexPlaylist: Playlist | undefined | null = null
                if (foundPlaylist) {
                    if (!settings.uri || !settings.token) {
                        throw new Error('Plex settings not configured properly');
                    }

                    const url = getAPIUrl(settings.uri, `/playlists`);
                    const result = await handleOneRetryAttempt<GetPlaylistResponse>(() => AxiosRequest.get(url, settings.token));
                
                    // eslint-disable-next-line unicorn/consistent-destructuring
                    plexPlaylist = result.data.MediaContainer.Metadata.find((item: Playlist) => item.ratingKey == foundPlaylist.plex)
                }

                //////////////////////////////////////
                // Load music search configuration
                //////////////////////////////////////
                const musicSearchConfig = await getMusicSearchConfig();
                if(!musicSearchConfig)
                    throw new Error(`Music search config not found`)

                const {searchApproaches} = musicSearchConfig;
                if(!searchApproaches || searchApproaches.length === 0)
                    throw new Error(`Search approaches not found`)

                const plexSearchConfig = {
                    uri: settings.uri,
                    token: settings.token,
                    musicSearchConfig,
                    searchApproaches
                };

                // @ts-ignore
                // eslint-disable-next-line prefer-const
                let { result, add, markChecked, recheck } = await getCachedPlexTracks(plexSearchConfig, data)

                // eslint-disable-next-line unicorn/consistent-destructuring
                const toSearchItems = data.tracks.filter(track => !result.some((item: SearchResponse) => item.id == track.id))
                const searchItems = [...toSearchItems, ...recheck]
                if (searchItems.length > 0) {
                    console.log(`Searching for ${toSearchItems.length} tracks, re-checking ${recheck.length} cached links`)
                    const searchResult = await matchByIsrc(plexSearchConfig, await plexMusicSearch(plexSearchConfig, searchItems), searchItems)
                    // eslint-disable-next-line unicorn/consistent-destructuring
                    const { merged, found, confirmed } = mergeSearchResults(result, searchResult, recheck, data.tracks)
                    result = merged

                    add(found, 'plex')
                    markChecked(confirmed)
                }

                ////////////
                // Put plex playlist
                ////////////
                await putPlexPlaylist(id, plexPlaylist, result, title, data.image)

                ////////////
                // Handle missing tracks
                ////////////
                // A search Plex never answered says nothing about the library: that track keeps its last
                // status, and the lists are still rewritten for every other track
                const unsearched = result.filter((track: SearchResponse) => track.failed && track.result.length == 0)
                if (unsearched.length > 0)
                    console.log(`Could not search Plex for ${unsearched.length} tracks; they keep their status from the last missing list`)

                const missingTracks = findMissingTracks(toSearchItems, result, lastMissing)
                if (missingTracks.length > 0)
                    console.log(`Missing ${missingTracks.length} tracks`)

                synced.set(id, { synced_at: Date.now(), missing: await missingListsFor(missingTracks) })

                /////////////////////////////
                // Store logs
                /////////////////////////////
                logComplete(itemLog)

            } catch (e) {
                const message = e instanceof Error ? e.message : 'Unknown error';
                logError(itemLog, `Something went wrong while syncing: ${message}`)
            }

        }

        // Built from every enrolled playlist's last sync, so one skipped or failed this run keeps its
        // missing tracks; until any playlist has synced, the last lists stand
        const kept = toSyncPlaylists.flatMap(({ id }) => {
            const entry = synced.get(id) ?? state[id];

            return entry ? [{ id, entry }] : [];
        })
        if (kept.length > 0) {
            savePlaylistSyncState(Object.fromEntries(kept.map(({ id, entry }) => [id, entry])))
            writeMissingLists(mergeMissingLists(kept.map(({ entry }) => entry.missing)))
        }

        // Mark sync as complete
        completeSyncType('playlists');
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        errorSyncType('playlists', message);
        throw e;
    }
}


function run() {
    console.log(`Start syncing items`)
    syncPlaylists()
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