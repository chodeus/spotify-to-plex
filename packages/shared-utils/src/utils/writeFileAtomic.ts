import { renameSync, rmSync, writeFileSync } from "node:fs";

/** Replaces the file whole, so a crash mid-write leaves the previous copy instead of a torn one. */
export function writeFileAtomic(path: string, content: string) {
    // Per-process name: the web app and the sync jobs write some of the same files
    const tempPath = `${path}.${process.pid}.tmp`;
    try {
        writeFileSync(tempPath, content);
        renameSync(tempPath, path);
    } catch (error) {
        // A process id that never writes again would leave this behind for good
        rmSync(tempPath, { force: true });
        throw error;
    }
}
