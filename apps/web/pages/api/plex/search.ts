import { generateError } from '@/helpers/errors/generateError';
import { AxiosRequest } from '@spotify-to-plex/http-client/AxiosRequest';
import { describeHttpError } from '@spotify-to-plex/http-client/describeHttpError';
import { getAPIUrl } from '@spotify-to-plex/shared-utils/utils/getAPIUrl';
import { getSettings } from '@spotify-to-plex/plex-config/functions/getSettings';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createRouter } from 'next-connect';

const router = createRouter<NextApiRequest, NextApiResponse>()
    .post(
        async (req, res) => {
            try {
                if (!req.body.query && !req.query.query)
                    return res.status(400).json({ message: "Please add a search query" });

                const settings = await getSettings();

                if (!settings.uri || !settings.token)
                    return res.status(400).json({ message: "No Plex connection found" });

                // The UI reports the server as verified on this answer, so Plex has to have answered with this token
                await AxiosRequest.get(getAPIUrl(settings.uri, '/library/sections'), settings.token)

                return res.json({ ok: true })
            } catch (error) {
                console.error(`Error performing Plex search: ${describeHttpError(error)}`);

                return res.status(500).json({ message: "Something went wrong while connecting to this server." })
            }
        })

export default router.handler({
    onError: (err: unknown, req: NextApiRequest, res: NextApiResponse) => {
        generateError(req, res, "Search", err);
    }
});


