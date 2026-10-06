import { renameSync, writeFileSync } from "node:fs";

/** Replaces the file whole, so a crash mid-write leaves the previous copy instead of a torn one. */
export function writeJsonFileAtomic(path: string, data: unknown, space: number = 4) {
    // Per-process name: the web app and the sync jobs write some of the same files
    const tempPath = `${path}.${process.pid}.tmp`;
    writeFileSync(tempPath, JSON.stringify(data, undefined, space));
    renameSync(tempPath, path);
}
