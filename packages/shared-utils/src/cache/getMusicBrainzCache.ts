import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { getStorageDir } from "../utils/getStorageDir"

type MusicBrainzAlbumCache = {
    spotify_album_id: string;
    musicbrainz_release_group_id: string;
    musicbrainz_artist_id: string;
    cached_at: number; // Unix timestamp
}

type MusicBrainzAlbumMiss = {
    spotify_album_id: string;
    cached_at: number;
}

// Long enough that a compilation MusicBrainz will never carry stops costing two
// requests every night, short enough that a release added later is still found
const MISS_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function getMusicBrainzCache() {
    //////////////////////////////////////
    // Handling cached MusicBrainz links
    //////////////////////////////////////
    const path = join(getStorageDir(), 'album_musicbrainz_links.json')
    let all: MusicBrainzAlbumCache[] = []

    if (existsSync(path))
        all = JSON.parse(readFileSync(path, 'utf8'))

    // Misses live in their own file so a miss can never be read as a mapping,
    // and so deleting them is a matter of deleting one file
    const missPath = join(getStorageDir(), 'album_musicbrainz_misses.json')
    let misses: MusicBrainzAlbumMiss[] = []

    if (existsSync(missPath))
        misses = JSON.parse(readFileSync(missPath, 'utf8'))

    /**
     * Whether a lookup for this album recently completed and found nothing.
     * Only ever set for a search that actually answered - never for one that
     * failed - so an unreachable MusicBrainz cannot become a lasting miss
     */
    const hasRecentMiss = (spotifyAlbumId: string) => {
        const miss = misses.find(item => item.spotify_album_id === spotifyAlbumId)

        return !!miss && Date.now() - miss.cached_at < MISS_TTL_MS
    }

    const addMiss = (spotifyAlbumId: string) => {
        misses = misses.filter(item => item.spotify_album_id !== spotifyAlbumId)
        misses.push({ spotify_album_id: spotifyAlbumId, cached_at: Date.now() })

        writeFileSync(missPath, JSON.stringify(misses, undefined, 4))
    }

    /**
     * Get cached MusicBrainz data for a Spotify album
     * @param spotifyAlbumId - The Spotify album ID to lookup
     * @returns The cached MusicBrainz data or undefined if not found
     */
    const get = (spotifyAlbumId: string): MusicBrainzAlbumCache | undefined => {
        return all.find(item => item.spotify_album_id === spotifyAlbumId)
    }

    /**
     * Add or update MusicBrainz cache entry
     * Deduplicates by spotify_album_id
     * @param entry - The MusicBrainz cache entry to add/update
     */
    const add = (entry: Omit<MusicBrainzAlbumCache, 'cached_at'>) => {
        // Remove existing entry if present (deduplication)
        all = all.filter(item => item.spotify_album_id !== entry.spotify_album_id)

        // Add new entry with timestamp
        const cacheEntry: MusicBrainzAlbumCache = {
            ...entry,
            cached_at: Date.now()
        }

        all.push(cacheEntry)

        // Write to file
        writeFileSync(path, JSON.stringify(all, undefined, 4))
    }

    /**
     * Add multiple MusicBrainz cache entries at once
     * Deduplicates by spotify_album_id
     * @param entries - Array of MusicBrainz cache entries to add/update
     */
    const addBatch = (entries: Omit<MusicBrainzAlbumCache, 'cached_at'>[]) => {
        const timestamp = Date.now()

        // Create a set of new spotify_album_ids for efficient deduplication
        const newSpotifyIds = new Set(entries.map(e => e.spotify_album_id))

        // Remove existing entries that will be replaced
        all = all.filter(item => !newSpotifyIds.has(item.spotify_album_id))

        // Add new entries with timestamp
        const cacheEntries: MusicBrainzAlbumCache[] = entries.map(entry => ({
            ...entry,
            cached_at: timestamp
        }))

        all.push(...cacheEntries)

        // Write to file
        writeFileSync(path, JSON.stringify(all, undefined, 4))
    }

    return { path, all, get, add, addBatch, hasRecentMiss, addMiss }
}
