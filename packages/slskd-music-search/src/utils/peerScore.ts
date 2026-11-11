export type PeerFigures = { uploadSpeed?: number; queueLength?: number; hasFreeUploadSlot?: boolean };

const QUEUE_DECAY = 0.94;
const NO_FREE_SLOT = 0.35;

// Speed only separates peers that are about as available: a fast peer with a queue starts later than an idle one
const SPEED_WEIGHT = 0.3;

/** How soon a peer is likely to deliver: its queue and free slot first, its upload speed second. */
export function peerScore({ uploadSpeed = 0, queueLength = 0, hasFreeUploadSlot = false }: PeerFigures) {
    const availability = QUEUE_DECAY ** Math.max(0, queueLength) * (hasFreeUploadSlot ? 1 : NO_FREE_SLOT);
    // Log scale, full marks from 10 MB/s: twice the speed is not twice as good
    const speed = Math.min(1, Math.log10(1 + Math.max(0, uploadSpeed)) / 7);

    return availability + speed * SPEED_WEIGHT;
}
