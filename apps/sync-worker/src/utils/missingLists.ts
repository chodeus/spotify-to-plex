import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { getStorageDir } from "@spotify-to-plex/shared-utils/utils/getStorageDir";
import { writeJsonFileAtomic } from "@spotify-to-plex/shared-utils/utils/writeJsonFileAtomic";
import { isLocalTrack } from "@spotify-to-plex/shared-utils/spotify/isLocalTrack";
import { LidarrAlbumData } from "@spotify-to-plex/shared-types/lidarr/LidarrAlbumData";
import { SlskdTrackData } from "@spotify-to-plex/shared-types/slskd/SlskdTrackData";
import { Track } from "@spotify-to-plex/shared-types/spotify/Track";
import { findMissingTidalTracks } from "./findMissingTidalTracks";
import { spotifyTrackId } from "./spotifyTrackId";

export type MissingLists = {
    spotify: string[];
    tidal: string[];
    lidarr: LidarrAlbumData[];
    slskd: SlskdTrackData[];
};

/** What one playlist's missing tracks add to each list. */
export async function missingListsFor(tracks: Track[]): Promise<MissingLists> {
    const lists: MissingLists = { spotify: [], tidal: [], lidarr: [], slskd: [] };

    for (const track of tracks) {
        const artist = track.artists[0] || 'Unknown Artist';
        const album = track.album || 'Unknown Album';

        if (track.album_id === 'unknown')
            console.log(`⚠️  Skipping track with unknown album_id: ${track.title} by ${track.artists[0]}`);
        else
            lists.lidarr.push({ artist_name: artist, album_name: album, spotify_album_id: track.album_id });

        // A local file has no spotify id to export - splitting its uri would yield the artist name
        const id = track.id && !isLocalTrack(track.id) ? spotifyTrackId(track.id) : undefined;
        if (!id)
            continue;

        lists.spotify.push(id);
        lists.slskd.push({ spotify_id: id, artist_name: artist, track_name: track.title || 'Unknown Track', album_name: album });
    }

    const tidalTracks = await findMissingTidalTracks(tracks);
    lists.tidal = tidalTracks.map(tidalTrack => tidalTrack.tidal_id);

    return lists;
}

/** Every playlist's lists as one, each entry once, at its first listing. */
export function mergeMissingLists(lists: MissingLists[]): MissingLists {
    return {
        spotify: unique(lists.flatMap(list => list.spotify), id => id),
        tidal: unique(lists.flatMap(list => list.tidal), id => id),
        lidarr: unique(lists.flatMap(list => list.lidarr), album => `${album.artist_name}|${album.album_name}`),
        slskd: unique(lists.flatMap(list => list.slskd), track => track.spotify_id)
    };
}

/** Replaces the missing-track files the Lidarr and slskd jobs read. */
export function writeMissingLists(lists: MissingLists) {
    writeFileSync(join(getStorageDir(), 'missing_tracks_spotify.txt'), lists.spotify.map(id => `https://open.spotify.com/track/${id}`).join('\n'))
    writeFileSync(join(getStorageDir(), 'missing_tracks_tidal.txt'), lists.tidal.map(id => `https://tidal.com/browse/track/${id}`).join('\n'))
    writeJsonFileAtomic(join(getStorageDir(), 'missing_tracks_lidarr.json'), lists.lidarr, 2)
    writeJsonFileAtomic(join(getStorageDir(), 'missing_tracks_slskd.json'), lists.slskd, 2)
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
