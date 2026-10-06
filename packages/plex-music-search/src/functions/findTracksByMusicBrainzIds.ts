import { getMetadata } from "../actions/getMetadata";
import { PlexMusicSearchConfig } from "../types/PlexMusicSearchConfig";
import { PlexTrack } from "../types/PlexTrack";
import metadataToTrackResult from "../utils/metadataToTrackResult";
import hubSearchToPlexTrack from "../utils/searching/hubSearchToPlexTrack";
import { searchForAlbum } from "../utils/searching/searchForAlbum";

/** Tracks with an "mbid://" guid from `trackIds` on the albums searchForAlbum finds for `album`. */
export async function findTracksByMusicBrainzIds(config: PlexMusicSearchConfig, artist: string, album: string, trackIds: string[], artistMatch?: Parameters<typeof searchForAlbum>[4]): Promise<PlexTrack[]> {
    const wanted = new Set(trackIds.map(id => `mbid://${id}`));
    const albums = await searchForAlbum(config.uri, config.token, artist, album, artistMatch);

    const hits: PlexTrack[] = [];

    for (const found of albums) {
        const tracks = await getMetadata(config.uri, config.token, `${found.id}?includeGuids=1`);

        hits.push(...tracks
            .filter(track => track.Guid?.some(guid => wanted.has(guid.id)))
            .map(track => hubSearchToPlexTrack(metadataToTrackResult(track))));
    }

    return hits;
}
