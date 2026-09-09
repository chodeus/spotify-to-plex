import { completeSyncType } from "./completeSyncType";
import { SyncType } from "@spotify-to-plex/shared-types/common/sync";

/**
 * Whether this job has nothing to do, marking it complete if so. Nothing
 * enrolled is a job with no work, not a failure - throwing left the nightly
 * sync showing red for as long as the list was empty.
 */
export function hasNothingEnrolled(items: unknown[], type: SyncType, label: string) {
    if (items.length > 0)
        return false;

    console.log(`No ${label} are enrolled for syncing`);
    completeSyncType(type);

    return true;
}
