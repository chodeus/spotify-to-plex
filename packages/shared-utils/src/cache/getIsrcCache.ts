import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { getStorageDir } from "../utils/getStorageDir"

type IsrcCacheEntry = {
    isrc: string;
    track_ids: string[];
    release_titles: string[];
    cached_at: number;
}

// Answers expire so a release MusicBrainz adds later still gets found. Mirrors
// MISS_TTL_MS in getMusicBrainzCache
const TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function getIsrcCache() {
    const path = join(getStorageDir(), 'isrc_musicbrainz_tracks.json')
    let all: IsrcCacheEntry[] = []

    if (existsSync(path))
        all = JSON.parse(readFileSync(path, 'utf8'))

    const get = (isrc: string) => all.find(item => item.isrc === isrc && Date.now() - item.cached_at < TTL_MS)

    // Only for a lookup MusicBrainz answered - an empty answer included
    const add = (isrc: string, trackIds: string[], releaseTitles: string[]) => {
        all = all.filter(item => item.isrc !== isrc)
        all.push({ isrc, track_ids: trackIds, release_titles: releaseTitles, cached_at: Date.now() })

        writeFileSync(path, JSON.stringify(all, undefined, 4))
    }

    return { path, get, add }
}
