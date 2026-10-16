import axios from 'axios';
import { LIDARR_TIMEOUT_MS } from './utils/lidarrTimeout';
import { withRetry } from './utils/withRetry';
import { getLidarrAlbum, type LidarrAlbum } from './getLidarrAlbum';

/**
 * Monitor an existing album in Lidarr and trigger a search to download it.
 * With releaseId, an album that has no files yet is pinned to that release first.
 */
export async function monitorAndSearchAlbum(
    foreignAlbumId: string,
    lidarrUrl: string,
    apiKey: string,
    releaseId?: string
): Promise<{ success: boolean; message: string }> {
    try {
        const baseUrl = lidarrUrl.endsWith('/') ? lidarrUrl.slice(0, -1) : lidarrUrl;

        // Get the existing album from Lidarr
        const existingAlbum = await getLidarrAlbum(foreignAlbumId, lidarrUrl, apiKey);

        if (!existingAlbum) {
            return {
                success: false,
                message: 'Album not found in Lidarr database'
            };
        }

        // Lidarr holds every track of its chosen release, so a search would only re-download it as an "upgrade"
        const { totalTrackCount = 0, trackFileCount = 0 } = existingAlbum.statistics ?? {};
        if (totalTrackCount > 0 && trackFileCount >= totalTrackCount) {
            return {
                success: true,
                message: 'Album complete in Lidarr, not searched'
            };
        }

        const pin = releaseId ? pinToRelease(existingAlbum, releaseId) : undefined;

        if (!existingAlbum.monitored || pin?.change) {
            const updateUrl = `${baseUrl}/api/v1/album/${existingAlbum.id}`;

            await withRetry(
                () => axios.put(updateUrl, {
                    ...existingAlbum,
                    ...pin?.change,
                    monitored: true
                }, {
                    headers: {
                        'X-Api-Key': apiKey,
                        'Content-Type': 'application/json'
                    },
                    timeout: LIDARR_TIMEOUT_MS
                })
            );
        }

        // Trigger album search to start download
        const commandUrl = `${baseUrl}/api/v1/command`;
        await withRetry(
            () => axios.post(commandUrl, {
                name: 'AlbumSearch',
                albumIds: [existingAlbum.id]
            }, {
                headers: {
                    'X-Api-Key': apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: LIDARR_TIMEOUT_MS
            })
        );

        const monitoring = existingAlbum.monitored ? 'Album already monitored' : 'Album set to monitored';

        return {
            success: true,
            message: [monitoring, pin?.note, 'search triggered'].filter(Boolean).join(', ')
        };

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';

        return {
            success: false,
            message: `Failed to monitor/search album: ${message}`
        };
    }
}

/**
 * Select Spotify's release and stop Lidarr importing any other release in its place.
 * Only while the album has no files: switching a release drops Lidarr's links to the files it has.
 */
function pinToRelease(album: LidarrAlbum, releaseId: string): { change?: Partial<LidarrAlbum>; note?: string } {
    // No statistics until Lidarr has loaded the album's tracks, so nothing says it is empty
    if (!album.statistics)
        return { note: "Lidarr had not loaded the album's releases yet, so none was selected" };

    if (album.statistics.trackFileCount !== 0)
        return {};

    const releases = album.releases ?? [];
    if (!releases.some(release => release.foreignReleaseId === releaseId))
        return { note: "Spotify's release is not in Lidarr's list" };

    const pinned = album.anyReleaseOk === false
        && releases.every(release => release.monitored === (release.foreignReleaseId === releaseId));
    if (pinned)
        return {};

    return {
        change: {
            anyReleaseOk: false,
            releases: releases.map(release => ({ ...release, monitored: release.foreignReleaseId === releaseId }))
        },
        note: "Spotify's release selected"
    };
}
