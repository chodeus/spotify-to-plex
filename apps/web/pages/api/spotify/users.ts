import { generateError } from '@/helpers/errors/generateError';
import { getStorageDir } from "@spotify-to-plex/shared-utils/utils/getStorageDir";
import { SpotifyCredentials } from '@spotify-to-plex/shared-types/spotify/SpotifyCredentials';
import { SpotifyUser } from '@spotify-to-plex/shared-types/spotify/SpotifyUser';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createRouter } from 'next-connect';
import { existsSync, readFileSync } from 'node:fs';
import { writeJsonFileAtomic } from '@spotify-to-plex/shared-utils/utils/writeJsonFileAtomic';
import { join } from 'node:path';

export type GetSpotifyUserResponse = SpotifyUser
const router = createRouter<NextApiRequest, NextApiResponse>()
    .get(
        async (_req, res) => {

            const credentialsPath = join(getStorageDir(), 'spotify.json')
            if (!existsSync(credentialsPath))
                return res.status(400).json({ error: "No users are currently connected." })

            const users: SpotifyCredentials[] = JSON.parse(readFileSync(credentialsPath, 'utf8'))

            return res.status(200).json(users.map(item => item.user))
        }
    )
    .put(
        async (req, res) => {

            const credentialsPath = join(getStorageDir(), 'spotify.json')
            if (!existsSync(credentialsPath))
                return res.status(400).json({ error: "No users are currently connected." })

            const credentials: SpotifyCredentials[] = JSON.parse(readFileSync(credentialsPath, 'utf8'))

            const { id, sync, label, recent_context } = req.body;
            const credential = credentials.find(item => item.user.id === id)
            if (!credential)
                return res.status(404).json({ error: "User is not found." })

            const { user } = credential;

            if (typeof sync === 'boolean')
                user.sync = sync;

            if (typeof recent_context === 'boolean')
                user.recentContext = recent_context;

            if (typeof label === 'string')
                user.label = label;

            // Change the imtes
            writeJsonFileAtomic(credentialsPath, credentials)

            return res.status(200).json(credentials.map(item => item.user))
        }
    )
    .delete(
        async (req, res) => {

            const credentialsPath = join(getStorageDir(), 'spotify.json')
            if (!existsSync(credentialsPath))
                return res.status(400).json({ error: `No users are currently connected.` })

            const { id } = req.query
            if (typeof id !== 'string')
                return res.status(400).json({ error: `ID expected but none found` })

            let users: SpotifyCredentials[] = JSON.parse(readFileSync(credentialsPath, 'utf8'))
            if (!users.some(item => item.user.id === id))
                return res.status(400).json({ error: `User not found` })


            // Change the imtes
            users = users.filter(item => item.user.id !== id)
            writeJsonFileAtomic(credentialsPath, users)

            // The same shape as GET: the page keeps this as its user list
            return res.status(200).json(users.map(item => item.user))

        }

    )

export default router.handler({
    onError: (err: unknown, req: NextApiRequest, res: NextApiResponse) => {
        generateError(req, res, "Spotify import", err);
    },
});


