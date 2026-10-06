import { join } from "node:path"
import { getStorageDir } from "../utils/getStorageDir"
import { writeJsonFileAtomic } from "../utils/writeJsonFileAtomic"
import { readCacheFile } from "./readCacheFile"

export type IsrcRecording = {
    length?: number;
    track_ids: string[];
    release_titles: string[];
}

type IsrcCacheEntry = {
    isrc: string;
    recordings: IsrcRecording[];
    cached_at: number;
}

// Answers expire so a release MusicBrainz adds later still gets found. Mirrors
// MISS_TTL_MS in getMusicBrainzCache
const TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function getIsrcCache() {
    const path = join(getStorageDir(), 'isrc_musicbrainz_tracks.json')
    // Never throws: matchByIsrc swallows a throw and would stop matching for good
    let all = readCacheFile<IsrcCacheEntry>(path)

    const get = (isrc: string) => all.find(item => item.isrc === isrc && Date.now() - item.cached_at < TTL_MS)

    // Only for a lookup MusicBrainz answered - an empty answer included
    const add = (isrc: string, recordings: IsrcRecording[]) => {
        all = all.filter(item => item.isrc !== isrc)
        all.push({ isrc, recordings, cached_at: Date.now() })

        writeJsonFileAtomic(path, all)
    }

    return { path, get, add }
}
