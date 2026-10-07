const EDITION = String.raw`edition|deluxe|expanded|extended|explicit|clean|remaster(?:ed)?|bonus tracks?|anniversary|radio edit|soundtrack|motion picture|original score`;
// A word that makes a bracket or a dash suffix an edition label rather than part of the title
const EDITION_WORD = new RegExp(String.raw`\b(?:${EDITION})\b`, 'i');
// What else a label may hold: "Super Deluxe", "20th Anniversary", "2008", "Live / Deluxe Edition"
const LABEL_FILLER = new RegExp(String.raw`\b(?:${EDITION}|live|super|special|limited|collector'?s|version|\d+(?:st|nd|rd|th)?)\b|[^\da-z]+`, 'gi');
const CREDIT = /^\s*(?:feat\.?|featuring|ft\.|with)\s/i;
// A remix or a mix is another release group, whatever else its bracket says
const OTHER_RELEASE = /\b(?:re)?mix\b/i;
const LIVE = /\blive\b/i;
// A bracket with no bracket inside, so "(Deluxe Edition [Remastered])" goes from the inside out
const INNER_BRACKET = /(\s*)([([])([^()[\]]*)([)\]])/g;
const SUFFIX = /^(.*\S)(?:\s[–—-]\s|:\s)(.+)$/;
const TRAILING_LABEL = /\s+(?:(?:super|special|limited|expanded|\d+(?:st|nd|rd|th))\s+)*(?:deluxe(?:\s+edition)?|edition)$/i;
// Stand-ins for a bracket that stays, so the loop moves on to its parent
const HIDDEN: Record<string, string> = { '(': '\uE000', ')': '\uE001', '[': '\uE002', ']': '\uE003' };

const onlyLabelWords = (segment: string) => !segment.replace(LABEL_FILLER, '').trim();

/** Whether a bracket or suffix names an edition of the album rather than part of its title. */
function isLabel(segment: string) {
    if (CREDIT.test(segment))
        return true;

    if (OTHER_RELEASE.test(segment))
        return false;

    // "(Live)" is a label; "(Live at the Anniversary Party)" is a title
    if (LIVE.test(segment))
        return onlyLabelWords(segment);

    return EDITION_WORD.test(segment) || onlyLabelWords(segment);
}

/**
 * An album title without the edition labels Spotify adds, and whether one of them said
 * "live": MusicBrainz never titles a live album "(Live)", it gives the release group the Live type.
 */
export function albumEdition(title: string) {
    let base = title;
    let live = false;
    const dropped = (segment: string) => {
        const label = isLabel(segment);
        live ||= label && LIVE.test(segment);

        return label;
    };

    while (base.search(INNER_BRACKET) > -1) {
        base = base.replace(INNER_BRACKET, (_whole, space: string, open: string, inner: string, close: string) =>
            (dropped(inner) ? '' : `${space}${HIDDEN[open]}${inner}${HIDDEN[close]}`));
    }

    base = base.replace(/[\uE000-\uE003]/g, hidden => Object.keys(HIDDEN).find(bracket => HIDDEN[bracket] === hidden) ?? '');

    for (let suffix = SUFFIX.exec(base); suffix?.[1] && suffix[2] && dropped(suffix[2]); suffix = SUFFIX.exec(base))
        [, base] = suffix;

    base = base.replace(TRAILING_LABEL, '').trim();

    return { base: base || title, live };
}

/** An album title without its edition labels, for matching against MusicBrainz release groups. */
export function albumBaseTitle(title: string) {
    return albumEdition(title).base;
}
