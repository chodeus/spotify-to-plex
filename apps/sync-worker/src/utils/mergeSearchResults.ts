import { SearchResponse } from "@spotify-to-plex/plex-music-search/types/SearchResponse";

/** Folds a search into the cached results, in Spotify's order. A re-checked link is only replaced by a match. */
export function mergeSearchResults(cached: SearchResponse[], searched: SearchResponse[], recheck: { id: string }[], order: { id: string }[]) {
    const isRecheck = (spotifyId: string) => recheck.some(track => track.id == spotifyId);

    // A re-check that finds nothing keeps its cached tracks
    const found = searched.filter(item => item.result.length > 0 || !isRecheck(item.id));
    const position = new Map(order.map((track, index) => [track.id, index]));
    const merged = cached
        .filter(item => !found.some(foundItem => foundItem.id == item.id))
        .concat(found)
        .sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));

    // Confirmed for another week, unless Plex never answered: then it stays due
    const confirmed = searched
        .filter(item => isRecheck(item.id) && item.result.length == 0 && !item.failed)
        .map(item => item.id);

    return { merged, found, confirmed };
}
