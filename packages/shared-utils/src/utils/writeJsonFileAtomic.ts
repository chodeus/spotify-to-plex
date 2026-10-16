import { writeFileAtomic } from "./writeFileAtomic";

/** Replaces the file whole with the data as JSON, so a crash mid-write leaves the previous copy instead of a torn one. */
export function writeJsonFileAtomic(path: string, data: unknown, space: number = 4) {
    writeFileAtomic(path, JSON.stringify(data, undefined, space));
}
