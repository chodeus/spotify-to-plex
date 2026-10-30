
// Below this the two tracks are different versions, not different encodes
const DIFFERENT_VERSION_BELOW = 0.65;
// From this up the two tracks are one edit - a fade or a remaster, not a radio edit against an extended mix
const SAME_EDIT_FROM = 0.97;

export function durationSimilarity(a?: number, b?: number) {
    if (!a || !b)
        return 0;

    return 1 - Math.abs(a - b) / Math.max(a, b);
}

/** Both durations are known and too far apart to be one recording. */
export function durationsContradict(a?: number, b?: number) {
    const similarity = durationSimilarity(a, b);

    return similarity > 0 && similarity < DIFFERENT_VERSION_BELOW;
}

/** Both durations are known and too far apart to be the same edit. */
export function durationsDiffer(a?: number, b?: number) {
    const similarity = durationSimilarity(a, b);

    return similarity > 0 && similarity < SAME_EDIT_FROM;
}
