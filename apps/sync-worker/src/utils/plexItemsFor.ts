import { PlaylistItem } from "@spotify-to-plex/plex-helpers/PlaylistItem";
import { SearchResponse } from "@spotify-to-plex/plex-music-search/types/SearchResponse";

/** The Plex item for each matched track, in playlist order; a track Plex did not answer for keeps its cached one. */
export function plexItemsFor(result: SearchResponse[], standIns: ReadonlyMap<string, string>): PlaylistItem[] {
    return result.flatMap(item => {
        const [first] = item.result;
        if (first)
            return [{ key: first.id, source: first.source }];

        const standIn = standIns.get(item.id);

        return standIn ? [{ key: standIn }] : [];
    });
}
