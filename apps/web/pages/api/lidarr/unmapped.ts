import { generateError } from '@/helpers/errors/generateError';
import type { UnmappedAlbum } from '@spotify-to-plex/shared-types/lidarr/UnmappedAlbum';
import { listedUnmapped, readUnmappedAlbums, setUnmappedDismissed, updateUnmappedAlbums } from '@spotify-to-plex/shared-utils/lidarr/unmappedAlbums';
import { isSpotifyId } from '@spotify-to-plex/shared-utils/musicbrainz/importLinks';
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
        if (!isSpotifyId(spotify_album_id) || typeof dismissed !== 'boolean')
            return res.status(400).json({ message: 'spotify_album_id (a Spotify album id) and dismissed are required' });

        const list = updateUnmappedAlbums(current => setUnmappedDismissed(current, spotify_album_id, dismissed));
        const album = listedUnmapped(list, spotify_album_id);
        if (!album)
            return res.status(404).json({ message: 'Album is not on the list' });

        res.status(200).json(album);
    });

export default router.handler({
    onError: (err: unknown, req: NextApiRequest, res: NextApiResponse) => {
        generateError(req, res, "Unmapped Albums", err);
    }
});
