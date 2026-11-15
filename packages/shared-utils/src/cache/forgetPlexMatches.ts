import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { getStorageDir } from "../utils/getStorageDir"
import { writeJsonFileAtomic } from "../utils/writeJsonFileAtomic"

import type { TrackLink } from "@spotify-to-plex/shared-types/common/track";

/** Takes every Plex match, hand-picks included, off the saved track and album links; Tidal and slskd matches stay. */
export function forgetPlexMatches() {
    const path = join(getStorageDir(), 'track_links.json')
    if (!existsSync(path))
        return;

    const links: TrackLink[] = JSON.parse(readFileSync(path, 'utf8'))
    writeJsonFileAtomic(path, links.map(({ plex_id, manual, plex_matched_by, plex_checked_at, ...link }) => link))
}
