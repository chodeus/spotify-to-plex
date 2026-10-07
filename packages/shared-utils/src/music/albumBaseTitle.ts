// Edition labels and credits Spotify adds to an album title. "(Live)" and "(... Remix)" are other release groups, so they stay
const EDITION_LABEL = /\s*[([](?:[^)\]]*\b(?:edition|deluxe|expanded|explicit|clean|remaster(?:ed)?|bonus tracks?|anniversary|radio edit)\b[^)\]]*|(?:feat\.?|featuring|ft\.|with)\s[^)\]]*)[)\]]/gi;

/** An album title without its edition labels, for matching against MusicBrainz release groups. */
export function albumBaseTitle(title: string) {
    const base = title.replace(EDITION_LABEL, '').trim();

    return base || title;
}
