/** The ratingKey at the end of a library key such as /library/metadata/123. */
export function ratingKeyOf(key: string) {
    return key.slice(key.lastIndexOf('/') + 1);
}
