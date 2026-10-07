import axios from 'axios';
import type { LidarrLookupResult } from '@spotify-to-plex/shared-types/musicbrainz/LidarrLookupResult';
import { LIDARR_TIMEOUT_MS } from './utils/lidarrTimeout';
import { withRetry } from './utils/withRetry';

/**
 * Lookup album in Lidarr using MusicBrainz release group ID: null when Lidarr
 * knows no such album. A failed request throws, so it is not mistaken for that.
 */
export async function lookupLidarrAlbum(releaseGroupId: string, lidarrUrl: string, apiKey: string) {
    const baseUrl = lidarrUrl.endsWith('/') ? lidarrUrl.slice(0, -1) : lidarrUrl;
    const lookupUrl = `${baseUrl}/api/v1/album/lookup?term=lidarr:${releaseGroupId}`;

    const response = await withRetry(
        () => axios.get<LidarrLookupResult[]>(lookupUrl, {
            headers: {
                'X-Api-Key': apiKey
            },
            timeout: LIDARR_TIMEOUT_MS
        })
    );

    return response.data?.[0] ?? null;
}
