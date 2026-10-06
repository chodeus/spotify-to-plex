import { getStorageDir } from '@spotify-to-plex/shared-utils/utils/getStorageDir';
import { SyncTypeLogCollection } from "@spotify-to-plex/shared-types/common/sync";
import { writeJsonFileAtomic } from "@spotify-to-plex/shared-utils/utils/writeJsonFileAtomic";
import { join } from "node:path";

export function saveSyncTypeLogs(logs: SyncTypeLogCollection) {
    const logsPath = join(getStorageDir(), 'sync_type_log.json');
    writeJsonFileAtomic(logsPath, logs);
}
