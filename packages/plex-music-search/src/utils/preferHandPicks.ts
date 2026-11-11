import { SearchResponse } from "../types/SearchResponse";

/** The search results, with each track matched by hand taking its hand pick instead. */
export function preferHandPicks(searched: SearchResponse[], picks: SearchResponse[]) {
    const byId = new Map(picks.map(pick => [pick.id, pick]));

    return searched.map(item => byId.get(item.id) ?? item);
}
