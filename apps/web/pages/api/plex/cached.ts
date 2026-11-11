import { generateError } from '@/helpers/errors/generateError';
import { getCachedMatches } from '@/helpers/plex/getCachedMatches';
import { PlexMusicSearchTrack } from '@spotify-to-plex/plex-music-search/types/PlexMusicSearchTrack';
import { getMusicSearchConfig } from "@spotify-to-plex/music-search/functions/getMusicSearchConfig";

import type { NextApiRequest, NextApiResponse } from 'next';
import { createRouter } from 'next-connect';
import { getSettings } from '@spotify-to-plex/plex-config/functions/getSettings';

// Large playlists ship thousands of tracks in one request/response (issue #94)
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '8mb',
        },
        responseLimit: false,
    },
}

const router = createRouter<NextApiRequest, NextApiResponse>()
    .post(
        async (req, res) => {
            try {
                const searchItems: PlexMusicSearchTrack[] = req.body.items;

                if (!Array.isArray(searchItems))
                    return res.status(200).json([]);

                const settings = await getSettings();

                if (!settings.token || !settings.uri)
                    return res.status(400).json({ msg: "Plex not configured" });

                //////////////////////////////////////
                // Load music search configuration
                //////////////////////////////////////
                const musicSearchConfig = await getMusicSearchConfig();
                const plexConfig = {
                    uri: settings.uri,
                    token: settings.token,
                    musicSearchConfig
                };

                const result = await getCachedMatches(searchItems, plexConfig)

                res.status(200).json(result);
            } catch (error) {
                res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to get cached tracks' });
            }
        })


export default router.handler({
    onError: (err: unknown, req: NextApiRequest, res: NextApiResponse) => {
        console.log(err)
        generateError(req, res, "Songs", err);
    }
});
