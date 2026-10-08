import { SearchResponse } from "@spotify-to-plex/plex-music-search/types/SearchResponse";

/** Folds a search into the cached results, in Spotify's order. A re-checked link is only replaced by a match. */
export function mergeSearchResults(cached: SearchResponse[], searched: SearchResponse[], recheck: { id: string }[], order: { id: string }[]) {
    const isRecheck = (spotifyId: string) => recheck.some(track => track.id == spotifyId);
    const cachedByIsrc = (spotifyId: string) => cached.some(item => item.id == spotifyId && item.matched_by == 'isrc');

    // A re-check that finds nothing keeps its cached tracks, and an ISRC link is the exact
    // recording, so only another ISRC match replaces it - never a title match
    const keepsCached = (item: SearchResponse) => isRecheck(item.id)
        && (item.result.length == 0 || (cachedByIsrc(item.id) && item.matched_by != 'isrc'));
    const found = searched.filter(item => !keepsCached(item));

    // A track listed twice has a result per listing: each takes the next of its id's positions
    const positions = new Map<string, number[]>();
    order.forEach((track, index) => positions.set(track.id, [...positions.get(track.id) ?? [], index]));
    const placed = new Map<string, number>();
    const merged = cached
        .filter(item => !found.some(foundItem => foundItem.id == item.id))
        .concat(found)
        .map(item => {
            const occurrence = placed.get(item.id) ?? 0;
            placed.set(item.id, occurrence + 1);

            return { item, at: positions.get(item.id)?.[occurrence] ?? 0 };
        })
        .sort((a, b) => a.at - b.at)
        .map(({ item }) => item);

    // Confirmed for another week, unless a Plex request failed: then it stays due
    const confirmed = searched
        .filter(item => keepsCached(item) && !item.failed)
        .map(item => item.id);

    return { merged, found, confirmed };
}
