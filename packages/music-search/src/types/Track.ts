
export type Track = {
    id: string
    artist: string
    title: string
    album?: string
    duration_ms?: number
    reason?: string
    // The title before search text-processing. The trimming approaches cut a
    // title at "(", which would hide the very qualifier a version check reads
    originalTitle?: string
    // Every credited act, so a collaborator in brackets reads as a credit
    artists?: string[]
    matching?: {
        album: { match: boolean; contains: boolean; similarity: number; };
        title: { match: boolean; contains: boolean; similarity: number; };
        artist: { match: boolean; contains: boolean; similarity: number; };
        artistInTitle: { match: boolean; contains: boolean; similarity: number; };
        artistWithTitle: { match: boolean; contains: boolean; similarity: number; };
        version?: { match: boolean; contains: boolean; similarity: number; };
        duration?: { similarity: number; available: boolean; };
        isMatchingApproach?:boolean;
    };
};
