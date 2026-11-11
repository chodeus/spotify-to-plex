import { SlskdFileAttribute } from "./SlskdFileAttribute";

export type SlskdFile = {
    username: string;
    filename: string;
    size: number;
    extension: string;
    bitRate?: number;
    sampleRate?: number;
    bitDepth?: number;
    length?: number;
    isLocked: boolean;
    // The peer sharing it, as slskd reports them with the search response
    uploadSpeed?: number;
    queueLength?: number;
    hasFreeUploadSlot?: boolean;
    attributes?: SlskdFileAttribute[];
};
