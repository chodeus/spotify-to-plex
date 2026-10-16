import { join } from "node:path";
import { getStorageDir } from "@spotify-to-plex/shared-utils/utils/getStorageDir";
import { writeFileAtomic } from "@spotify-to-plex/shared-utils/utils/writeFileAtomic";
import { writeJsonFileAtomic } from "@spotify-to-plex/shared-utils/utils/writeJsonFileAtomic";
import { isLocalTrack } from "@spotify-to-plex/shared-utils/spotify/isLocalTrack";
import { LidarrAlbumData } from "@spotify-to-plex/shared-types/lidarr/LidarrAlbumData";
import { SlskdTrackData } from "@spotify-to-plex/shared-types/slskd/SlskdTrackData";
import { Track } from "@spotify-to-plex/shared-types/spotify/Track";
import { findMissingTidalAlbums } from "./findMissingTidalAlbums";
import { findMissingTidalTracks } from "./findMissingTidalTracks";
import { spotifyTrackId } from "./spotifyTrackId";

/** Spotify and Tidal hold track ids for the playlists job and album ids for the albums job. */
export type MissingLists = {
    spotify: string[];
    tidal: string[];
    lidarr: LidarrAlbumData[];
    slskd: SlskdTrackData[];
};

export function emptyMissingLists(): MissingLists {
    return { spotify: [], tidal: [], lidarr: [], slskd: [] };
}

/** What one playlist's missing tracks add to each list. */
export async function missingListsFor(tracks: Track[]): Promise<MissingLists> {
    const { lidarr, slskd } = lidarrAndSlskdEntries(tracks);
    const tidalTracks = await findMissingTidalTracks(tracks);

    return { spotify: slskd.map(track => track.spotify_id), tidal: tidalTracks.map(tidalTrack => tidalTrack.tidal_id), lidarr, slskd };
}

/** What one album with missing tracks adds to each list: the album itself, and those tracks for slskd. */
export async function missingAlbumListsFor(albumId: string, tracks: Track[]): Promise<MissingLists> {
    const { lidarr, slskd } = lidarrAndSlskdEntries(tracks, albumId);

    return { spotify: [albumId], tidal: await findMissingTidalAlbums(tracks), lidarr, slskd };
}

/** Every item's lists as one, each entry once, at its first listing. */
export function mergeMissingLists(lists: MissingLists[]): MissingLists {
    return {
        spotify: unique(lists.flatMap(list => list.spotify), id => id),
        tidal: unique(lists.flatMap(list => list.tidal), id => id),
        lidarr: unique(lists.flatMap(list => list.lidarr), album => `${album.artist_name}|${album.album_name}`),
        slskd: unique(lists.flatMap(list => list.slskd), track => track.spotify_id)
    };
}

/** Replaces one job's missing files (missing_tracks_* or missing_albums_*), which the Lidarr and slskd jobs read. */
export function writeMissingLists(kind: 'track' | 'album', lists: MissingLists) {
    const path = (list: string) => join(getStorageDir(), `missing_${kind}s_${list}`);

    writeFileAtomic(path('spotify.txt'), lists.spotify.map(id => `https://open.spotify.com/${kind}/${id}`).join('\n'))
    writeFileAtomic(path('tidal.txt'), lists.tidal.map(id => `https://tidal.com/browse/${kind}/${id}`).join('\n'))
    writeJsonFileAtomic(path('lidarr.json'), lists.lidarr, 2)
    writeJsonFileAtomic(path('slskd.json'), lists.slskd, 2)
}

function lidarrAndSlskdEntries(tracks: Track[], albumId?: string) {
    const lidarr: LidarrAlbumData[] = [];
    const slskd: SlskdTrackData[] = [];

    for (const track of tracks) {
        const artist = track.artists[0] || 'Unknown Artist';
        const album = track.album || 'Unknown Album';

        if (track.album_id === 'unknown')
            console.log(`⚠️  Skipping track with unknown album_id: ${track.title} by ${track.artists[0]}`);
        else
            lidarr.push({ artist_name: artist, album_name: album, spotify_album_id: albumId ?? track.album_id });

        // A local file has no spotify id to export - splitting its uri would yield the artist name
        const id = track.id && !isLocalTrack(track.id) ? spotifyTrackId(track.id) : undefined;
        if (id)
            slskd.push({ spotify_id: id, artist_name: artist, track_name: track.title || 'Unknown Track', album_name: album });
    }

    return { lidarr, slskd };
}

function unique<T>(items: T[], keyOf: (item: T) => string) {
    const seen = new Set<string>();

    return items.filter(item => {
        const key = keyOf(item);
        if (seen.has(key))
            return false;

        seen.add(key);

        return true;
    });
}
