import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getStorageDir } from "@spotify-to-plex/shared-utils/utils/getStorageDir";
import { writeJsonFileAtomic } from "@spotify-to-plex/shared-utils/utils/writeJsonFileAtomic";
import { MissingLists } from "./missingLists";

export type PlaylistSyncState = { synced_at: number; missing: MissingLists };

const FILE = 'playlists_sync_state.json';
const DAY_MS = 24 * 60 * 60 * 1000;
// A nightly run that starts a few minutes earlier than the last one still counts as a day later
const SLACK_MS = DAY_MS / 2;

/** Each playlist's last completed sync, by saved-item id; a playlist absent here is due. */
export function readPlaylistSyncState(): Record<string, PlaylistSyncState> {
    const path = join(getStorageDir(), FILE);
    if (!existsSync(path))
        return {};

    try {
        const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));

        return Object.fromEntries(Object.entries(parsed as object).filter(([, entry]) => isPlaylistSyncState(entry)));
    } catch (e) {
        // Costs one full sync: every playlist is due again
        console.error(`Error reading ${FILE}:`, e);

        return {};
    }
}

export function savePlaylistSyncState(state: Record<string, PlaylistSyncState>) {
    writeJsonFileAtomic(join(getStorageDir(), FILE), state, 2);
}

/** When the playlist is next due, or undefined when it is due now. */
export function notDueUntil(entry: PlaylistSyncState | undefined, days: number, now = Date.now()) {
    // A stamp ahead of this clock (skew, a restored backup) would never come due
    if (!entry || entry.synced_at > now)
        return;

    const next = entry.synced_at + days * DAY_MS;

    return next - SLACK_MS > now ? new Date(next) : undefined;
}

function isPlaylistSyncState(entry: unknown): entry is PlaylistSyncState {
    const { synced_at: syncedAt, missing } = (entry ?? {}) as Partial<PlaylistSyncState>;

    return Number.isFinite(syncedAt) && !!missing && Array.isArray(missing.spotify) && Array.isArray(missing.tidal)
        && Array.isArray(missing.lidarr) && Array.isArray(missing.slskd);
}
