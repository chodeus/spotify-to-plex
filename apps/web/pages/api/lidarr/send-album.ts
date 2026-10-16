import { generateError } from '@/helpers/errors/generateError';
import { getLidarrSettings } from '@spotify-to-plex/plex-config/functions/getLidarrSettings';
import { addOrMonitorAlbum } from '@spotify-to-plex/shared-utils/lidarr/addOrMonitorAlbum';
import { getMusicBrainzIds } from '@spotify-to-plex/shared-utils/lidarr/getMusicBrainzIds';
import { lookupLidarrAlbum } from '@spotify-to-plex/shared-utils/lidarr/lookupLidarrAlbum';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createRouter } from 'next-connect';

const router = createRouter<NextApiRequest, NextApiResponse>()
    .post(async (req, res) => {
        try {
            const { spotify_album_id, artist_name, album_name } = req.body;

            if (!spotify_album_id) {
                console.error('spotify_album_id is required');

                return res.status(400).json({
                    success: false,
                    message: 'spotify_album_id is required',
                });
            }

            // Get Lidarr settings
            const settings = await getLidarrSettings();
            if (!settings.enabled) {
                return res.status(400).json({
                    success: false,
                    message: 'Lidarr is not enabled',
                });
            }

            if (!settings.url) {
                return res.status(400).json({
                    success: false,
                    message: 'Lidarr URL is not configured',
                });
            }

            const apiKey = process.env.LIDARR_API_KEY;
            if (!apiKey) {
                return res.status(400).json({
                    success: false,
                    message: 'LIDARR_API_KEY environment variable is not set',
                });
            }

            // Step 1: Get MusicBrainz IDs (with fallback using artist/album names)
            const musicBrainzIds = await getMusicBrainzIds(spotify_album_id, artist_name, album_name);
            if (musicBrainzIds.status === 'unavailable') {
                return res.status(503).json({
                    success: false,
                    message: 'MusicBrainz is unavailable, please try again',
                });
            }

            if (musicBrainzIds.status !== 'found') {
                return res.status(404).json({
                    success: false,
                    message: `No MusicBrainz mapping found for Spotify album: ${spotify_album_id}`,
                });
            }

            const { releaseGroupId, releaseId } = musicBrainzIds;

            // Step 2: Lookup album in Lidarr
            const lidarrAlbum = await lookupLidarrAlbum(releaseGroupId, settings.url, apiKey);

            if (!lidarrAlbum?.artist) {
                return res.status(404).json({
                    success: false,
                    message: 'Album not found in Lidarr database',
                });
            }

            // Step 3: Add to Lidarr, or monitor the album it has, then search
            const outcome = await addOrMonitorAlbum(lidarrAlbum, releaseId, settings, apiKey);

            if (outcome.result === 'failed') {
                console.error('Error sending album to Lidarr:', outcome.message);

                return res.status(500).json({
                    success: false,
                    message: outcome.message,
                });
            }

            return res.status(200).json({
                success: outcome.ok,
                message: outcome.result === 'added' && outcome.ok ? `Successfully added "${lidarrAlbum.title}" to Lidarr` : outcome.message,
            });

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('Error in send-album:', message);

            return res.status(500).json({
                success: false,
                message,
            });
        }
    });

export default router.handler({
    onError: (err: unknown, req: NextApiRequest, res: NextApiResponse) => {
        generateError(req, res, "Lidarr Send Album", err);
    }
});
