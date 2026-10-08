import { generateError } from '@/helpers/errors/generateError';
import { getPlexServers } from '@/helpers/plex/getPlexServers';
import { AxiosRequest } from '@spotify-to-plex/http-client/AxiosRequest';
import { describeHttpError } from '@spotify-to-plex/http-client/describeHttpError';
import { getAPIUrl } from '@spotify-to-plex/shared-utils/utils/getAPIUrl';
import { getSettings } from '@spotify-to-plex/plex-config/functions/getSettings';
import { updateSettings } from '@spotify-to-plex/plex-config/functions/updateSettings';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createRouter } from 'next-connect';

export type GetSettingsResponse = {
    loggedin: boolean
    uri?: string,
    id?: string,
}
const router = createRouter<NextApiRequest, NextApiResponse>()
    .post(
        async (req, res) => {
            try {
                const { id, uri } = req.body ?? {};
                if (uri) {
                    const { token } = await getSettings(true);
                    // Only a connection plex.tv lists for one of this account's servers, with that server's own token:
                    // a caller cannot point the token at a host of its choosing
                    const servers = token ? await getPlexServers(token) : [];
                    const server = servers.find(item => item.id === id);
                    const connection = server?.connections.find(item => item.uri === uri);
                    if (!server || !connection)
                        return res.status(400).json({ error: 'Unknown Plex server or connection' });

                    // Checked before it is saved: a connection that does not answer must not replace one that does
                    try {
                        await AxiosRequest.get(getAPIUrl(connection.uri, '/library/sections'), server.accessToken)
                    } catch (error) {
                        console.error(`Plex did not answer at the chosen connection: ${describeHttpError(error)}`);

                        return res.status(502).json({ error: 'Plex did not answer at that connection' });
                    }

                    await updateSettings({ uri: connection.uri, id: server.id, serverToken: server.accessToken })
                }

                const settings = await getSettings(true);
                res.json({ loggedin: !!settings.token, uri: settings.uri, id: settings.id })
            } catch (error) {
                console.error(`Error updating Plex settings: ${describeHttpError(error)}`);
                res.status(500).json({ error: 'Failed to update settings' });
            }
        })
    .get(
        async (_req, res) => {
            try {
                const settings = await getSettings(true);
                res.json({ loggedin: !!settings.token, uri: settings.uri, id: settings.id })
            } catch (error) {
                console.error('Error getting Plex settings:', error);
                res.json({ loggedin: false })
            }
        })


export default router.handler({
    onError: (err: unknown, req: NextApiRequest, res: NextApiResponse) => {
        generateError(req, res, "Songs", err);
    }
});

