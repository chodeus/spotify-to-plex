import { AxiosRequest } from '@spotify-to-plex/http-client/AxiosRequest';
import { describeHttpError } from '@spotify-to-plex/http-client/describeHttpError';
// MIGRATED: Updated to use http-client package
import { generateError } from '@/helpers/errors/generateError';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createRouter } from 'next-connect';
import { getSettings } from '@spotify-to-plex/plex-config/functions/getSettings';
import { getAPIUrl } from '@spotify-to-plex/shared-utils/utils/getAPIUrl';

export const config = {
    api: {
        externalResolver: true,
    },
}

// Only artwork: any other Plex path would go out with the server token, /security/token included
const IMAGE_PATH = /^\/(?:library\/metadata\/\d+\/(?:thumb|art|banner|clearLogo)|playlists\/\d+\/composite)(?:\/\d+)?$/;

const router = createRouter<NextApiRequest, NextApiResponse>()
    .get(
        async (req, res) => {
            const { path } = req.query;

            if (!path || Array.isArray(path) || !IMAGE_PATH.test(path))
                return res.status(400).end();

            const settings = await getSettings();

            if (!settings.token)
                return res.status(400).end();

            // getAPIUrl refuses a path that would send the token to another host
            let url: string;
            try {
                url = getAPIUrl(settings.uri, path);
            } catch (_error) {
                return res.status(400).end();
            }

            try {
                const data = await AxiosRequest.get<any>(url, settings.token, { responseType: "arraybuffer" })
                // axios keys its headers in lower case
                const contentType = data.headers?.['content-type'];
                if (typeof contentType !== 'string' || !contentType.startsWith('image/')) {
                    res.setHeader("Cache-Control", "no-store");

                    return res.status(502).end();
                }

                res.setHeader("Cache-Control", `public, immutable, no-transform, s-maxage=31536000, max-age=31536000`);
                res.setHeader('content-type', contentType)
                res.setHeader('content-length', data.data.length)

                return res.status(200).send(data.data)
            } catch (error) {
                console.error(`Plex image request failed: ${describeHttpError(error)}`);
                // A failure must not be cached for a year like an image
                res.setHeader("Cache-Control", "no-store");

                return res.status(502).end();
            }
        })

export default router.handler({
    onError: (err: unknown, req: NextApiRequest, res: NextApiResponse) => {
        generateError(req, res, "Image", err);
    },
});