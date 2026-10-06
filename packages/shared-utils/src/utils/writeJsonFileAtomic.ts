import { renameSync, rmSync, writeFileSync } from "node:fs";

/** Replaces the file whole, so a crash mid-write leaves the previous copy instead of a torn one. */
export function writeJsonFileAtomic(path: string, data: unknown, space: number = 4) {
    // Per-process name: the web app and the sync jobs write some of the same files
    const tempPath = `${path}.${process.pid}.tmp`;
    try {
        writeFileSync(tempPath, JSON.stringify(data, undefined, space));
        renameSync(tempPath, path);
    } catch (error) {
        // A process id that never writes again would leave this behind for good
        rmSync(tempPath, { force: true });
        throw error;
    }
}
