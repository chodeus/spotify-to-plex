import { SearchResponse } from "@spotify-to-plex/plex-music-search/types/SearchResponse";
import { spotifyTrackId } from "./spotifyTrackId";

type SearchedTrack = { id: string; title: string; artists: string[] };

/** Searched tracks Plex has no match for. One Plex could not search keeps the status the last written list gave it. */
export function findMissingTracks<T extends SearchedTrack>(searched: T[], result: SearchResponse[], lastMissing: Set<string>) {
    return searched.filter(({ id, title, artists }) => {
        const wasMissing = lastMissing.has(spotifyTrackId(id) ?? '');

        return result.some(track => track.title == title && artists.indexOf(track.artist) > -1 && track.result.length == 0 && (!track.failed || wasMissing));
    });
}
