import { getLidarrSettings } from "@spotify-to-plex/plex-config/functions/getLidarrSettings";
import { getStorageDir } from "@spotify-to-plex/shared-utils/utils/getStorageDir";
import { LidarrAlbumData } from "@spotify-to-plex/shared-types/lidarr/LidarrAlbumData";
import { LidarrAddAlbumRequest } from "@spotify-to-plex/shared-types/lidarr/LidarrAddAlbumRequest";
import { LidarrSyncLog } from "@spotify-to-plex/shared-types/lidarr/LidarrSyncLog";
import axios from "axios";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getNestedSyncLogsForType } from "../utils/getNestedSyncLogsForType";
import { startSyncType } from "../utils/startSyncType";
import { clearSyncTypeLogs } from "../utils/clearSyncTypeLogs";
import { completeSyncType } from "../utils/completeSyncType";
import { errorSyncType } from "../utils/errorSyncType";
import { updateSyncTypeProgress } from "../utils/updateSyncTypeProgress";
import { getMusicBrainzIds } from "@spotify-to-plex/shared-utils/lidarr/getMusicBrainzIds";
import { lookupLidarrAlbum } from "@spotify-to-plex/shared-utils/lidarr/lookupLidarrAlbum";
import { monitorAndSearchAlbum } from "@spotify-to-plex/shared-utils/lidarr/monitorAndSearchAlbum";

/**
 * Add the album to Lidarr and start a search for it. Lidarr answering 409 means
 * it already has the album, in which case monitor what is there and search that
 * instead. One owner for the whole outcome, so the job body does not nest a
 * try/catch inside its own try inside the loop.
 */
async function addOrMonitorAlbum(addRequest: LidarrAddAlbumRequest, foreignAlbumId: string, baseUrl: string, url: string, apiKey: string) {
    const headers = { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' };

    try {
        const addResponse = await axios.post(`${baseUrl}/api/v1/album`, addRequest, { headers });
        const albumId = addResponse.data?.id;
        if (albumId)
            await axios.post(`${baseUrl}/api/v1/command`, { name: 'AlbumSearch', albumIds: [albumId] }, { headers });

        return { ok: true, message: undefined as string | undefined };
    } catch (error: any) {
        const result = error.response?.data?.[0];
        const albumExists = error.response?.status === 409 || result?.errorCode === 'AlbumExistsValidator';
        if (!albumExists)
            return { ok: false, message: error.message as string | undefined };

        const monitorResult = await monitorAndSearchAlbum(foreignAlbumId, url, apiKey);

        return { ok: monitorResult.success, message: monitorResult.message as string | undefined };
    }
}

export async function syncLidarr() {
    console.log('Starting Lidarr sync...');

    // Check Lidarr settings
    const settings = await getLidarrSettings();
    if (!settings.enabled)
        return;

    // Start sync type logging
    startSyncType('lidarr');
    clearSyncTypeLogs('lidarr');

    try {

        if (!settings.url)
            return;

        const apiKey = process.env.LIDARR_API_KEY?.trim();
        if (!apiKey)
            return;

        // Read albums and tracks to sync from both files
        const albumsPath = join(getStorageDir(), 'missing_albums_lidarr.json');
        const tracksPath = join(getStorageDir(), 'missing_tracks_lidarr.json');

        const albumsFromAlbums: LidarrAlbumData[] = [];
        const albumsFromTracks: LidarrAlbumData[] = [];

        // Read albums file
        if (existsSync(albumsPath)) {
            try {
                const content = readFileSync(albumsPath, 'utf8');
                const parsed = JSON.parse(content);
                albumsFromAlbums.push(...parsed);
            } catch (e) {
                console.error('Error reading missing_albums_lidarr.json:', e);
            }
        }

        // Read tracks file
        if (existsSync(tracksPath)) {
            try {
                const content = readFileSync(tracksPath, 'utf8');
                const parsed = JSON.parse(content);
                albumsFromTracks.push(...parsed);
            } catch (e) {
                console.error('Error reading missing_tracks_lidarr.json:', e);
            }
        }

        // Merge both arrays and deduplicate
        const albumMap = new Map<string, LidarrAlbumData>();
        [...albumsFromAlbums, ...albumsFromTracks].forEach(album => {
            const key = `${album.artist_name}|${album.album_name}`;
            albumMap.set(key, album);
        });

        const albums = Array.from(albumMap.values());

        if (albums.length === 0)
            return;

        // Initialize logs
        const { putLog, logComplete } = getNestedSyncLogsForType('lidarr');
        const syncLog = putLog('lidarr-sync', 'Lidarr Sync');

        // Read existing Lidarr logs
        const lidarrLogsPath = join(getStorageDir(), 'lidarr_sync_log.json');
        const lidarrLogs: Record<string, LidarrSyncLog> = {};

        // Process each album
        let successCount = 0;
        let errorCount = 0;
        let notFoundCount = 0;

        for (let i = 0; i < albums.length; i++) {
            const album = albums[i];
            if (!album)
                continue;

            // Update progress
            updateSyncTypeProgress('lidarr', i + 1, albums.length);

            const albumKey = `${album.artist_name}|${album.album_name}`;
            const logId = `${Date.now()}-${albumKey}`;

            const albumLog: LidarrSyncLog = {
                id: logId,
                artist_name: album.artist_name,
                album_name: album.album_name,
                start: Date.now(),
                status: 'error',
            };

            try {

                // VALIDATION: Skip albums with unknown album_id
                if (album.spotify_album_id === 'unknown') {
                    albumLog.status = 'error';
                    albumLog.error = 'Album ID is unknown (likely from simplified mode or incomplete data)';
                    albumLog.end = Date.now();
                    errorCount++;
                    lidarrLogs[logId] = albumLog;
                    console.log(`⚠️  Skipping album (unknown ID): ${album.artist_name} - ${album.album_name}`);
                    continue;
                }

                // VALIDATION: Ensure spotify_album_id exists
                if (!album.spotify_album_id) {
                    albumLog.status = 'error';
                    albumLog.error = 'Missing spotify_album_id';
                    albumLog.end = Date.now();
                    errorCount++;
                    lidarrLogs[logId] = albumLog;
                    continue;
                }

                // STEP 1: Get MusicBrainz IDs (with fallback using artist/album names)
                const musicBrainzIds = await getMusicBrainzIds(album.spotify_album_id, album.artist_name, album.album_name);

                if (musicBrainzIds.status !== 'found') {
                    // An unreachable MusicBrainz is this run's problem, not a
                    // verdict on the album - logging it as not_found reads as
                    // "this album does not exist", and it is retried next sync
                    const unavailable = musicBrainzIds.status === 'unavailable';
                    albumLog.status = unavailable ? 'error' : 'not_found';
                    albumLog.error = unavailable ? 'MusicBrainz unavailable, retrying next sync' : 'No MusicBrainz mapping found';
                    albumLog.end = Date.now();
                    errorCount += unavailable ? 1 : 0;
                    notFoundCount += unavailable ? 0 : 1;
                    lidarrLogs[logId] = albumLog;
                    continue;
                }

                const { releaseGroupId, artistId } = musicBrainzIds;
                albumLog.musicbrainz_album_id = releaseGroupId;
                albumLog.musicbrainz_artist_id = artistId;

                // STEP 2: Lookup album in Lidarr using MusicBrainz ID
                const baseUrl = settings.url.endsWith('/') ? settings.url.slice(0, -1) : settings.url;
                const lidarrAlbum = await lookupLidarrAlbum(releaseGroupId, settings.url, apiKey);

                if (!lidarrAlbum?.artist) {
                    albumLog.status = 'not_found';
                    albumLog.error = 'Album not found in Lidarr database';
                    albumLog.end = Date.now();
                    notFoundCount++;
                    lidarrLogs[logId] = albumLog;
                    continue;
                }

                // STEP 3: Add to Lidarr (this part remains the same)
                const addRequest: LidarrAddAlbumRequest = {
                    foreignAlbumId: lidarrAlbum.foreignAlbumId,
                    title: lidarrAlbum.title,
                    artistId: 0,
                    profileId: settings.quality_profile_id,
                    qualityProfileId: settings.quality_profile_id,
                    metadataProfileId: settings.metadata_profile_id,
                    monitored: true,
                    anyReleaseOk: true,
                    rootFolderPath: settings.root_folder_path,
                    addOptions: {
                        searchForNewAlbum: true,
                    },
                    artist: {
                        foreignArtistId: lidarrAlbum.artist.foreignArtistId,
                        artistName: lidarrAlbum.artist.artistName,
                        qualityProfileId: settings.quality_profile_id,
                        metadataProfileId: settings.metadata_profile_id,
                        rootFolderPath: settings.root_folder_path,
                        monitored: true,
                        addOptions: {
                            monitor: "none",
                            monitored: true,
                            searchForMissingAlbums: false,
                        },
                    },
                };

                const outcome = await addOrMonitorAlbum(addRequest, lidarrAlbum.foreignAlbumId, baseUrl, settings.url, apiKey);
                albumLog.status = outcome.ok ? 'success' : 'error';
                albumLog.error = outcome.message;
                albumLog.end = Date.now();
                successCount += outcome.ok ? 1 : 0;
                errorCount += outcome.ok ? 0 : 1;
                lidarrLogs[logId] = albumLog;

            } catch (error: unknown) {
                albumLog.status = 'error';
                albumLog.error = error instanceof Error ? error.message : 'Unknown error';
                albumLog.end = Date.now();
                errorCount++;
                lidarrLogs[logId] = albumLog;
            }

            await new Promise(resolve => {
                setTimeout(resolve, 1000); // Increased from 500ms to 1000ms for MusicBrainz rate limit
            });
        }

        // Save Lidarr logs
        writeFileSync(lidarrLogsPath, JSON.stringify(lidarrLogs, null, 2));

        // Complete sync log
        logComplete(syncLog);

        console.log(`Lidarr sync complete: ${successCount} success, ${notFoundCount} not found, ${errorCount} errors`);

        // Mark sync as complete
        completeSyncType('lidarr');
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        errorSyncType('lidarr', message);
        throw e;
    }
}

function run() {
    syncLidarr()
        .then(() => {
            console.log('Lidarr sync completed');
        })
        .catch((e: unknown) => {
            console.error('Lidarr sync failed:', e);
        });
}

// Only run if this file is executed directly, not when imported
// eslint-disable-next-line unicorn/prefer-module
if (require.main === module) {
    run();
}
