import { readFileSync } from "node:fs"

/** A cache file's entries, or none when it is missing or torn: MusicBrainz can always refill a cache. */
export function readCacheFile<T>(path: string): T[] {
    try {
        const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))

        return Array.isArray(parsed) ? parsed as T[] : []
    } catch (_e) {
        return []
    }
}
