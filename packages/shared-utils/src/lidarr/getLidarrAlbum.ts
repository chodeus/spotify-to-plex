import axios from 'axios';
import { LIDARR_TIMEOUT_MS } from './utils/lidarrTimeout';
import { withRetry } from './utils/withRetry';

export type LidarrAlbum = {
    id: number;
    foreignAlbumId: string;
    title: string;
    monitored: boolean;
    artistId: number;
    statistics?: {
        trackFileCount: number;
        // trackCount skips an unmonitored album's tracks without files; this counts them all
        totalTrackCount: number;
    };
};

/**
 * Get an existing album from Lidarr by its MusicBrainz release group ID: null when
 * Lidarr has no such album. A failed request throws, so it is not mistaken for that.
 */
export async function getLidarrAlbum(foreignAlbumId: string, lidarrUrl: string, apiKey: string): Promise<LidarrAlbum | null> {
    const baseUrl = lidarrUrl.endsWith('/') ? lidarrUrl.slice(0, -1) : lidarrUrl;
    const url = `${baseUrl}/api/v1/album?foreignAlbumId=${foreignAlbumId}`;

    const response = await withRetry(
        () => axios.get<LidarrAlbum[]>(url, {
            headers: {
                'X-Api-Key': apiKey
            },
            timeout: LIDARR_TIMEOUT_MS
        })
    );

    return response.data?.[0] ?? null;
}
