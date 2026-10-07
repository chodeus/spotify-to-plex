import { SpotifyImage } from "./SpotifyImage";
import { SpotifyOwner } from "./SpotifyOwner";
import { SpotifyScraperTrack } from "./SpotifyScraperTrack";

export type GetSpotifyScraperData = {
    duration_ms: number;
    id: string;
    images: SpotifyImage[];
    name: string;
    owner: SpotifyOwner;
    track_count: number | null;
    tracks: SpotifyScraperTrack[];
    truncated?: boolean;
    type: string;
    uri: string;
};