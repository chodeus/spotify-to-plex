import { getMetadata } from "../actions/getMetadata";
import { PlexMusicSearchConfig } from "../types/PlexMusicSearchConfig";
import { PlexTrack } from "../types/PlexTrack";
import metadataToTrackResult from "../utils/metadataToTrackResult";
import hubSearchToPlexTrack from "../utils/searching/hubSearchToPlexTrack";
import { searchForAlbum } from "../utils/searching/searchForAlbum";

/**
 * Tracks on the artist's albums titled `album` whose MusicBrainz track id is one
 * of `trackIds`. Plex exposes that id as an "mbid://" guid on tagged tracks.
 */
export async function findTracksByMusicBrainzIds(config: PlexMusicSearchConfig, artist: string, album: string, trackIds: string[]): Promise<PlexTrack[]> {
    const wanted = new Set(trackIds.map(id => `mbid://${id}`));
    const albums = await searchForAlbum(config.uri, config.token, artist, album);

    const hits: PlexTrack[] = [];

    for (const found of albums) {
        const tracks = await getMetadata(config.uri, config.token, `${found.id}?includeGuids=1`);

        hits.push(...tracks
            .filter(track => track.Guid?.some(guid => wanted.has(guid.id)))
            .map(track => hubSearchToPlexTrack(metadataToTrackResult(track))));
    }

    return hits;
}
