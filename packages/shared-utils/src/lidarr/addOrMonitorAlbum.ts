import axios from 'axios';
import type { LidarrAddAlbumRequest } from '@spotify-to-plex/shared-types/lidarr/LidarrAddAlbumRequest';
import type { LidarrLookupResult } from '@spotify-to-plex/shared-types/musicbrainz/LidarrLookupResult';
import { LIDARR_TIMEOUT_MS } from './utils/lidarrTimeout';
import { withRetry } from './utils/withRetry';
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
    // failed: Lidarr refused the add; not_found: its metadata has nothing to add; added and existing both go on to monitor and search
    result: 'added' | 'existing' | 'failed' | 'not_found';
    ok: boolean;
    message?: string;
};

type AddResult = { result: 'added' | 'existing' } | { result: 'failed' | 'not_found'; message: string };

/**
 * Add the album to Lidarr, or take the one it already has, then monitor it,
 * pin Spotify's release when known, and search.
 */
export async function addOrMonitorAlbum(lidarrAlbum: LidarrLookupResult, releaseId: string | undefined, settings: LidarrAddSettings, apiKey: string): Promise<AddOrMonitorOutcome> {
    // Lidarr answers the lookup of an album it has from its library, with that album's id
    const added: AddResult = lidarrAlbum.id ? { result: 'existing' } : await addAlbum(lidarrAlbum, settings, apiKey);
    if (added.result === 'failed' || added.result === 'not_found')
        return { result: added.result, ok: false, message: added.message };

    // A fresh album has no releases until the refresh Lidarr queues after the add; the pin needs them.
    // "Already added" for an album the lookup did not find is fresh too: a retried add that timed out, or another sender
    if (!lidarrAlbum.id && releaseId)
        await waitForReleases(lidarrAlbum.foreignAlbumId, settings.url, apiKey);

    // Its own read decides the pin and says what happened, even if the wait gave up just before Lidarr finished
    const outcome = await monitorAndSearchAlbum(lidarrAlbum.foreignAlbumId, settings.url, apiKey, releaseId);

    return { result: added.result, ok: outcome.success, message: outcome.message };
}

async function addAlbum(lidarrAlbum: LidarrLookupResult, settings: LidarrAddSettings, apiKey: string): Promise<AddResult> {
    // Lidarr would add it as an empty album that no search can fill
    if (lidarrAlbum.releases.length === 0)
        return { result: 'not_found', message: "Lidarr's metadata has no releases for this album yet" };

    const baseUrl = settings.url.endsWith('/') ? settings.url.slice(0, -1) : settings.url;

    try {
        // A retry after an add that timed out but went through meets the "already added" answer below
        await withRetry(() => axios.post(`${baseUrl}/api/v1/album`, addRequest(lidarrAlbum, settings), {
            headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
            timeout: LIDARR_TIMEOUT_MS
        }));

        return { result: 'added' };
    } catch (error: any) {
        if (error.response?.data?.[0]?.errorCode === 'AlbumExistsValidator')
            return { result: 'existing' };

        // Lidarr answers any failed database constraint with 409, so only the album being there means another add won
        if (error.response?.status === 409 && await getLidarrAlbum(lidarrAlbum.foreignAlbumId, settings.url, apiKey).catch(() => null))
            return { result: 'existing' };

        return { result: 'failed', message: lidarrErrorMessage(error) };
    }
}

async function waitForReleases(foreignAlbumId: string, url: string, apiKey: string) {
    const deadline = Date.now() + RELEASE_WAIT_MS;

    for (;;) {
        // A failed read is monitorAndSearchAlbum's to report
        const album = await getLidarrAlbum(foreignAlbumId, url, apiKey).catch(() => null);
        if ((album?.releases?.length && album.statistics) || Date.now() >= deadline)
            return;

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
        // Lidarr keeps the sent list when its metadata has no cover, and refuses a missing one
        images: [],
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
            // Unset means All: every album a later refresh finds would come in monitored
            monitorNewItems: "none",
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
