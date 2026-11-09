import { generateError } from '@/helpers/errors/generateError';
import type { UnmappedAlbum } from '@spotify-to-plex/shared-types/lidarr/UnmappedAlbum';
import { readUnmappedAlbums, setUnmappedDismissed, updateUnmappedAlbums } from '@spotify-to-plex/shared-utils/lidarr/unmappedAlbums';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createRouter } from 'next-connect';

export type GetUnmappedAlbumsResponse = {
    albums: UnmappedAlbum[];
    dismissed: number;
};

// Retrying an album goes through /api/lidarr/send-album, which keeps this list current
const router = createRouter<NextApiRequest, NextApiResponse>()
    .get((req, res) => {
        const all = Object.values(readUnmappedAlbums());
        const showDismissed = req.query.all === '1';
        const albums = all
            .filter(album => showDismissed || !album.dismissed)
            .sort((a, b) => b.first_seen - a.first_seen);

        const response: GetUnmappedAlbumsResponse = { albums, dismissed: all.filter(album => album.dismissed).length };
        res.status(200).json(response);
    })
    .patch((req, res) => {
        const { spotify_album_id, dismissed } = req.body ?? {};
        if (typeof spotify_album_id !== 'string' || typeof dismissed !== 'boolean')
            return res.status(400).json({ message: 'spotify_album_id and dismissed are required' });

        const list = updateUnmappedAlbums(current => setUnmappedDismissed(current, spotify_album_id, dismissed));
        if (!list[spotify_album_id])
            return res.status(404).json({ message: 'Album is not on the list' });

        res.status(200).json(list[spotify_album_id]);
    });

export default router.handler({
    onError: (err: unknown, req: NextApiRequest, res: NextApiResponse) => {
        generateError(req, res, "Unmapped Albums", err);
    }
});
