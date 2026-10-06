import metadataToTrackResult from "../utils/metadataToTrackResult";
import { getMetadata } from "./getMetadata";

export default async function getAlbumTracks(uri: string, token: string, key: string) {
    const albumTracks = await getMetadata(uri, token, key);

    return albumTracks.map(metadataToTrackResult);
}