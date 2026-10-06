import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { getStorageDir } from "../utils/getStorageDir"
import { writeJsonFileAtomic } from "../utils/writeJsonFileAtomic"

import type { TrackLink } from "@spotify-to-plex/shared-types/common/track";

export function setManualTrackLink(spotifyId: string, plexId: string) {
    const path = join(getStorageDir(), 'track_links.json')
    let all: TrackLink[] = []

    if (existsSync(path))
        all = JSON.parse(readFileSync(path, 'utf8'))

    let trackLink = all.find(item => item.spotify_id == spotifyId)
    if (!trackLink) {
        trackLink = { spotify_id: spotifyId }
        all.push(trackLink)
    }

    // A deliberate choice replaces whatever was matched automatically
    trackLink.plex_id = [plexId]
    trackLink.manual = true

    writeJsonFileAtomic(path, all)
}
