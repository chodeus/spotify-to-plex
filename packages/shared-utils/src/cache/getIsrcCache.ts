import { readFileSync, renameSync, writeFileSync } from "node:fs"
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

    try {
        all = JSON.parse(readFileSync(path, 'utf8'))
    } catch (_e) {
        // Missing or torn: start empty, because matchByIsrc swallows a throw and would stop matching for good
    }

    const get = (isrc: string) => all.find(item => item.isrc === isrc && Date.now() - item.cached_at < TTL_MS)

    // Only for a lookup MusicBrainz answered - an empty answer included
    const add = (isrc: string, trackIds: string[], releaseTitles: string[]) => {
        all = all.filter(item => item.isrc !== isrc)
        all.push({ isrc, track_ids: trackIds, release_titles: releaseTitles, cached_at: Date.now() })

        // Per-process temp name: scheduler runSync() has no overlap guard, so two syncs can write at once
        const tempPath = `${path}.${process.pid}.tmp`
        writeFileSync(tempPath, JSON.stringify(all, undefined, 4))
        renameSync(tempPath, path)
    }

    return { path, get, add }
}
