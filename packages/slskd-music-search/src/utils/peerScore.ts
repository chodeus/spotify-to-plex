export type PeerFigures = { uploadSpeed?: number; queueLength?: number; hasFreeUploadSlot?: boolean };

// Each queued upload ahead costs 6%, and a peer with no free slot starts at about a third
const QUEUE_DECAY = 0.94;
const NO_FREE_SLOT = 0.35;

/** How likely a peer is to deliver soon, 0 to 2: its queue and free slot, then its upload speed. */
export function peerScore({ uploadSpeed = 0, queueLength = 0, hasFreeUploadSlot = false }: PeerFigures) {
    const availability = QUEUE_DECAY ** Math.max(0, queueLength) * (hasFreeUploadSlot ? 1 : NO_FREE_SLOT);
    // Log scale, full marks from 10 MB/s: twice the speed is not twice as good
    const speed = Math.min(1, Math.log10(1 + Math.max(0, uploadSpeed)) / 7);

    return availability + speed;
}
