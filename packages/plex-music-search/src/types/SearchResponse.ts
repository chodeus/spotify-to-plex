import { PlexTrack } from "./PlexTrack";

export type SearchResponse = {
    id: string;
    artist: string;
    title: string;
    album: string;
    duration_ms?: number;
    queries?: SearchQuery[]
    result: PlexTrack[];
    matched_by?: 'isrc';
    // A Plex request failed and nothing was found, so the empty result says nothing about the library
    failed?: boolean;
};

export type SearchQuery = {
    approach: string
    artist: string
    title: string
    album: string,
    result?: PlexTrack[]
}