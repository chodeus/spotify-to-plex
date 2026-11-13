import { generateError } from '@/helpers/errors/generateError';
import { describeHttpError } from '@spotify-to-plex/http-client/describeHttpError';
import { getPlexHomeUsers, PlexHomeUser } from '@spotify-to-plex/plex-helpers/utils/plexSettingsFor';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createRouter } from 'next-connect';

export type GetPlexHomeUsersResponse = PlexHomeUser[]

const router = createRouter<NextApiRequest, NextApiResponse>()
    .get(
        async (_req, res) => {
            try {
                const users: GetPlexHomeUsersResponse = await getPlexHomeUsers();

                return res.status(200).json(users)
            } catch (error) {
                console.error(`Error fetching Plex Home users: ${describeHttpError(error)}`);

                return res.status(502).json({ error: 'Plex Home users could not be loaded' })
            }
        })

export default router.handler({
    onError: (err: unknown, req: NextApiRequest, res: NextApiResponse) => {
        generateError(req, res, "Plex Home users", err);
    }
});
