import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getStorageDir } from "@spotify-to-plex/shared-utils/utils/getStorageDir";
import { writeJsonFileAtomic } from "@spotify-to-plex/shared-utils/utils/writeJsonFileAtomic";
import { mergeMissingLists, MissingLists } from "./missingLists";

export type SyncState = { synced_at: number; missing: MissingLists };

export const PLAYLISTS_STATE_FILE = 'playlists_sync_state.json';
export const ALBUMS_STATE_FILE = 'albums_sync_state.json';

const DAY_MS = 24 * 60 * 60 * 1000;
// A nightly run that starts a few minutes earlier than the last one still counts as a day later
const SLACK_MS = DAY_MS / 2;

/** One job's last completed sync of each saved item, plus the syncs made this run. */
export function openSyncState(file: string) {
    const stored = readSyncState(file);
    const synced = new Map<string, SyncState>();

    return {
        notDueUntil: (id: string, days: number) => notDueUntil(stored[id], days),
        record: (id: string, missing: MissingLists) => { synced.set(id, { synced_at: Date.now(), missing }) },
        /** Keeps each enrolled item's latest sync and returns their lists merged; undefined until one has synced. */
        // clean runs over the items not synced now too, so a change made since their sync reaches them
        settle(enrolled: { id: string }[], clean?: (missing: MissingLists) => MissingLists | undefined) {
            const kept = enrolled.flatMap(({ id }) => {
                const entry = synced.get(id) ?? stored[id];
                if (!entry)
                    return [];

                return [[id, { ...entry, missing: clean?.(entry.missing) ?? entry.missing }] as const];
            });
            if (kept.length == 0)
                return;

            writeJsonFileAtomic(join(getStorageDir(), file), Object.fromEntries(kept), 2);

            return mergeMissingLists(kept.map(([, entry]) => entry.missing));
        }
    };
}

/** Passes every stored sync's lists through change; returns them merged when any changed, as settle() would. */
export function rewriteSyncState(file: string, change: (missing: MissingLists) => MissingLists | undefined) {
    let changed = false;
    const entries = Object.entries(readSyncState(file)).map(([id, entry]) => {
        const missing = change(entry.missing);
        if (!missing)
            return [id, entry] as const;

        changed = true;

        return [id, { ...entry, missing }] as const;
    });
    if (!changed)
        return;

    writeJsonFileAtomic(join(getStorageDir(), file), Object.fromEntries(entries), 2);

    return mergeMissingLists(entries.map(([, entry]) => entry.missing));
}

export function clearSyncState(file: string) {
    writeJsonFileAtomic(join(getStorageDir(), file), {}, 2);
}

/** The stored syncs by saved-item id; an item absent here is due. */
export function readSyncState(file: string): Record<string, SyncState> {
    const path = join(getStorageDir(), file);
    if (!existsSync(path))
        return {};

    try {
        const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));

        return Object.fromEntries(Object.entries(parsed as object).filter(([, entry]) => isSyncState(entry)));
    } catch (e) {
        // Costs one full sync: every item is due again
        console.error(`Error reading ${file}:`, e);

        return {};
    }
}

/** When the item is next due, or undefined when it is due now. */
export function notDueUntil(entry: SyncState | undefined, days: number, now = Date.now()) {
    // A stamp ahead of this clock (skew, a restored backup) would never come due
    if (!entry || entry.synced_at > now)
        return;

    const next = entry.synced_at + days * DAY_MS;

    return next - SLACK_MS > now ? new Date(next) : undefined;
}

function isSyncState(entry: unknown): entry is SyncState {
    const { synced_at: syncedAt, missing } = (entry ?? {}) as Partial<SyncState>;

    return Number.isFinite(syncedAt) && !!missing && Array.isArray(missing.spotify) && Array.isArray(missing.tidal)
        && Array.isArray(missing.lidarr) && Array.isArray(missing.slskd);
}
