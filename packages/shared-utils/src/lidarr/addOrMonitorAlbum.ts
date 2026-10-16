import axios from 'axios';
import type { LidarrAddAlbumRequest } from '@spotify-to-plex/shared-types/lidarr/LidarrAddAlbumRequest';
import type { LidarrLookupResult } from '@spotify-to-plex/shared-types/musicbrainz/LidarrLookupResult';
import { LIDARR_TIMEOUT_MS } from './utils/lidarrTimeout';
import { getLidarrAlbum } from './getLidarrAlbum';
import { monitorAndSearchAlbum } from './monitorAndSearchAlbum';

const RELEASE_WAIT_MS = 90_000;
const RELEASE_POLL_MS = 3000;

export type LidarrAddSettings = {
    url: string;
    root_folder_path: string;
    quality_profile_id: number;
    metadata_profile_id: number;
};

export type AddOrMonitorOutcome = {
    // failed: Lidarr refused the add; added and existing both go on to monitor and search
    result: 'added' | 'existing' | 'failed';
    ok: boolean;
    message?: string;
};

/**
 * Add the album to Lidarr, or take the one it already has (Lidarr answers 409),
 * then monitor it, pin Spotify's release when known, and search.
 */
export async function addOrMonitorAlbum(lidarrAlbum: LidarrLookupResult, releaseId: string | undefined, settings: LidarrAddSettings, apiKey: string): Promise<AddOrMonitorOutcome> {
    const baseUrl = settings.url.endsWith('/') ? settings.url.slice(0, -1) : settings.url;
    let result: 'added' | 'existing' = 'added';

    try {
        await axios.post(`${baseUrl}/api/v1/album`, addRequest(lidarrAlbum, settings), {
            headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
            timeout: LIDARR_TIMEOUT_MS
        });
    } catch (error: any) {
        const albumExists = error.response?.status === 409 || error.response?.data?.[0]?.errorCode === 'AlbumExistsValidator';
        if (!albumExists)
            return { result: 'failed', ok: false, message: lidarrErrorMessage(error) };

        result = 'existing';
    }

    // A fresh album has no releases until the refresh Lidarr queues after the add; the pin needs them
    const loaded = result === 'existing' || !releaseId || await releasesLoaded(lidarrAlbum.foreignAlbumId, settings.url, apiKey);
    const outcome = await monitorAndSearchAlbum(lidarrAlbum.foreignAlbumId, settings.url, apiKey, releaseId);
    const message = loaded ? outcome.message : `${outcome.message}; Lidarr had not loaded its releases yet, so none was selected`;

    return { result, ok: outcome.success, message };
}

async function releasesLoaded(foreignAlbumId: string, url: string, apiKey: string) {
    const deadline = Date.now() + RELEASE_WAIT_MS;

    for (;;) {
        // A failed read is monitorAndSearchAlbum's to report
        const album = await getLidarrAlbum(foreignAlbumId, url, apiKey).catch(() => null);
        if (album?.releases?.length && album.statistics)
            return true;

        if (Date.now() >= deadline)
            return false;

        await new Promise(resolve => { setTimeout(resolve, RELEASE_POLL_MS) });
    }
}

function addRequest(lidarrAlbum: LidarrLookupResult, settings: LidarrAddSettings): LidarrAddAlbumRequest {
    return {
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
            // monitorAndSearchAlbum searches once the release is pinned; Lidarr's own search would run before it
            searchForNewAlbum: false,
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
}

// Lidarr answers a refused add with a list of validation errors
function lidarrErrorMessage(error: any): string {
    const data = error.response?.data;
    if (Array.isArray(data) && data.length > 0) {
        const [first] = data;

        return first.errorMessage || first.message || JSON.stringify(first);
    }

    return data?.message || error.message || 'Failed to send album';
}
