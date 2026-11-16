import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { getStorageDir } from "../utils/getStorageDir"
import { writeJsonFileAtomic } from "../utils/writeJsonFileAtomic"

import type { TrackLink } from "@spotify-to-plex/shared-types/common/track";

type PlexMatch = Pick<TrackLink, 'spotify_id' | 'plex_id' | 'manual' | 'plex_matched_by' | 'plex_checked_at'>
type ServerCopy = { server: string, matches: PlexMatch[] }

const linksPath = () => join(getStorageDir(), 'track_links.json')
const copiesPath = () => join(getStorageDir(), 'plex_matches_by_server.json')

// Unlike readCacheFile, a torn file throws: read as empty, it would be written back over every match
function readList<T>(path: string): T[] {
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : []
}

/** Keeps a copy of the server's Plex matches, then takes them off every track and album link; Tidal and slskd matches stay. */
export function forgetPlexMatches(server: string) {
    const links = readList<TrackLink>(linksPath())
    const copies = readList<ServerCopy>(copiesPath())
    const live = links
        .filter(link => link.plex_id?.length)
        .map(({ spotify_id, plex_id, manual, plex_matched_by, plex_checked_at }) => ({ spotify_id, plex_id, manual, plex_matched_by, plex_checked_at }))
    // A copy still kept means its restore did not finish: it keeps the matches the links lack
    const liveIds = new Set(live.map(match => match.spotify_id))
    const notPutBack = (copies.find(copy => copy.server === server)?.matches ?? []).filter(match => !liveIds.has(match.spotify_id))

    // The copy is saved before the links lose their matches
    writeJsonFileAtomic(copiesPath(), [...copies.filter(copy => copy.server !== server), { server, matches: [...notPutBack, ...live] }])
    writeJsonFileAtomic(linksPath(), links.map(({ plex_id, manual, plex_matched_by, plex_checked_at, ...link }) => link))
}

/** Puts back the Plex matches kept for the server when it was last left, if any, then drops that copy. */
export function restorePlexMatches(server: string) {
    const copies = readList<ServerCopy>(copiesPath())
    const copy = copies.find(item => item.server === server)
    if (!copy)
        return;

    const links = readList<TrackLink>(linksPath())
    const bySpotifyId = new Map(links.map(link => [link.spotify_id, link]))

    for (const match of copy.matches) {
        const link = bySpotifyId.get(match.spotify_id)
        if (link)
            Object.assign(link, match)
        else
            links.push(match)
    }

    writeJsonFileAtomic(linksPath(), links)
    // Dropped only once put back: forgetPlexMatches merges a copy still kept into the next one
    writeJsonFileAtomic(copiesPath(), copies.filter(item => item !== copy))
}
