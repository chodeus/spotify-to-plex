import { getStorageDir } from '@spotify-to-plex/shared-utils/utils/getStorageDir';
import { SyncLogCollection } from "@spotify-to-plex/shared-types/common/sync";
import { writeJsonFileAtomic } from "@spotify-to-plex/shared-utils/utils/writeJsonFileAtomic";
import { join } from "node:path";

export function saveNestedSyncLogs(logs: SyncLogCollection) {
    const logsPath = join(getStorageDir(), 'sync_log.json');
    writeJsonFileAtomic(logsPath, logs);
}
