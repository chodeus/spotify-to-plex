import { generateError } from '@/helpers/errors/generateError';
import { getPlexServers } from '@/helpers/plex/getPlexServers';
import { describeHttpError } from '@spotify-to-plex/http-client/describeHttpError';
import { getSettings } from '@spotify-to-plex/plex-config/functions/getSettings';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createRouter } from 'next-connect';


export type GetPlexResourcesResponse = {
    name: string
    id: string
    connections: {
        uri: string,
        local: boolean
    }[]
}

const router = createRouter<NextApiRequest, NextApiResponse>()
    .get(
        async (_req, res) => {

            try {

                const settings = await getSettings(true);
                if (!settings?.token)
                    return res.status(400).json({ message: "No Plex connection found" });

                // The server tokens stay here; the browser only picks a server and one of its connections
                const servers = await getPlexServers(settings.token);
                const result: GetPlexResourcesResponse[] = servers.map(({ name, id, connections }) => ({ name, id, connections }));

                return res.status(200).json(result)
            } catch (error) {
                console.error(`Error fetching Plex resources: ${describeHttpError(error)}`);

                return res.status(400).json({ message: "No resources found" })
            }
        })


export default router.handler({
    onError: (err: unknown, req: NextApiRequest, res: NextApiResponse) => {
        generateError(req, res, "Songs", err);
    }
});

