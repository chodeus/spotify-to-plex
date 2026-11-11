import { generateError } from '@/helpers/errors/generateError';
import { setManualTrackLink } from '@spotify-to-plex/shared-utils/cache/setManualTrackLink';
import { forgetMissingTrack } from 'cronjob/forgetMissingTrack';

import type { NextApiRequest, NextApiResponse } from 'next';
import { createRouter } from 'next-connect';

const router = createRouter<NextApiRequest, NextApiResponse>()
    .post(
        async (req, res) => {
            const { spotifyId, plexId } = req.body;

            if (typeof spotifyId !== 'string' || !spotifyId.trim() || typeof plexId !== 'string' || !plexId.trim())
                return res.status(400).json({ error: "Missing spotifyId or plexId" });

            try {
                setManualTrackLink(spotifyId, plexId);
            } catch (error) {
                console.error('Error caching manual match:', error);

                return res.status(500).json({ error: 'Failed to save the manual match' });
            }

            // The match is saved either way: the lists catch up at the next sync
            try {
                await forgetMissingTrack(spotifyId);
            } catch (error) {
                console.error('Error taking a hand-matched track off the missing lists:', error);
            }

            return res.json({ success: true });
        })

export default router.handler({
    onError: (err: unknown, req: NextApiRequest, res: NextApiResponse) => {
        generateError(req, res, "Cache manual match", err);
    }
});
