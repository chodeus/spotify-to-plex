import { SearchResponse } from "@spotify-to-plex/plex-music-search/types/SearchResponse";
import { spotifyTrackId } from "./spotifyTrackId";

/** Searched tracks Plex has no match for. One Plex could not search, or holds through a stand-in key, keeps the status the last written list gave it. */
export function findMissingTracks<T extends { id: string }>(searched: T[], result: SearchResponse[], lastMissing: Set<string>, standIns: ReadonlyMap<string, string>) {
    return searched.filter(({ id }) => {
        const wasMissing = lastMissing.has(spotifyTrackId(id) ?? '');

        return result.some(track => track.id == id && track.result.length == 0 && (!(track.failed || standIns.has(id)) || wasMissing));
    });
}
