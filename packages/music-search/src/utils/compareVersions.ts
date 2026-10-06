import { getState } from "../functions/state/getState";

// "(radio edit)", "[live]", "{dub}" and the trailing " - Radio Edit" form Spotify uses
const BRACKETED = /\(([^)]*)\)|\[([^\]]*)]|{([^}]*)}/g;
const TRAILING_DASH = /\s-\s(.+)$/;

// "(feat. X)", "(with X)", "(& X)" - a credit, not a version of the recording
const CREDIT = /^(?:feat|feats|featuring|ft|with|w)\b|^[&+]/;
// "From \"8 Mile\" Soundtrack" - provenance, not a version
const PROVENANCE = /^from\b/;
const YEAR = /\b(?:19|20)\d{2}\b/g;
// "03 - Stronger" is a track number in a tag, not "Stronger" as a version
const TRACK_NUMBER = /^\s*\d+\s*$/;
// Acts get joined many ways - "A & B", "A x B", "A Vs. B" - and each side is a
// credit in its own right
const ACT_SEPARATOR = /\s*(?:&|\+|,|\/|\bvs\.?|\bversus\b|\bx\b)\s*/;

// Qualifiers that name no particular version. Longest first so "main mix" is
// removed whole rather than leaving a bare "mix" behind
const STRUCTURAL = ['digital album version', 'album version', 'bonus track', 'main mix', 'radio mix', 'main', 'deluxe', 'explicit', 'clean', 'mono', 'stereo', 'version'];

// A fragment shorter than this carries no version meaning on its own
const MIN_QUALIFIER_LENGTH = 3;

function escapeForRegex(word: string) {
    return word.replace(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
}

/**
 * Remove a noise word, but only where it stands as a whole word. Removing it as
 * a plain substring would eat the middle of real words - "main" out of
 * "Germaine", "clean" out of "cleaner" - and silently invent a version match
 */
function removeWord(text: string, word: string) {
    const pattern = new RegExp(String.raw`\b${escapeForRegex(word.toLowerCase())}\b`, 'g');

    return text.replace(pattern, ' ');
}

function plainWords(text: string) {
    return text
        .toLowerCase()
        .replace(/[^\d a-z]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * The individual acts named in a credit string, so that
 * "Dimitri Vegas & Like Mike Vs.W&W" and its two credited artists reduce to the
 * same set of names
 */
function actNames(text: string) {
    return text
        .toLowerCase()
        .split(ACT_SEPARATOR)
        .map(part => plainWords(part))
        .filter(part => part.length > 0);
}

/**
 * Whether a qualifier only names acts already credited on the track - a
 * collaborator in brackets is a credit, not a version, so "Desire (Sub Focus &
 * Dimension)" is the same recording as "Desire". Names are matched whole and
 * never by substring, which keeps "Culture Shock Remix" a version next to the
 * credited artist "Culture Shock".
 */
function isCredit(segment: string, credits: string[]) {
    const parts = actNames(segment);
    if (parts.length == 0)
        return false;

    const credited = new Set<string>();

    for (const credit of credits) {
        for (const name of actNames(credit))
            credited.add(name);

        // The unsplit name too, so "Chase & Status" matches as the one act it is
        const whole = plainWords(credit);
        if (whole)
            credited.add(whole);
    }

    return credited.size > 0 && parts.every(part => credited.has(part));
}

/**
 * Whether a title states the version outside a qualifier. "The Island, Pt. II:
 * Dusk" and "Feel for You VIP" name the same version as "(Dusk)" and "- VIP",
 * they just do not bracket it.
 */
function titleStatesVersion(title: string, version: string) {
    if (!version)
        return false;

    const words = new Set(plainWords(title.replace(BRACKETED, ' ').replace(TRAILING_DASH, ' ')).split(' '));

    return version.split(' ').every(word => words.has(word));
}

/**
 * The version qualifier of a title - "acoustic", "jauz remix", "uk edit" - or ''
 * when the title names no particular version. Credits, provenance and words the
 * user treats as noise are not version distinctions.
 */
export function extractVersion(title: string, filterOutWords: string[], credits: string[] = []): string {
    const segments: string[] = [];

    for (const match of title.matchAll(BRACKETED))
        segments.push(match[1] ?? match[2] ?? match[3] ?? '');

    const withoutBrackets = title.replace(BRACKETED, '');
    const trailing = TRAILING_DASH.exec(withoutBrackets);
    // What precedes the dash being a track number makes this a tag, not a version
    if (trailing?.[1] && !TRACK_NUMBER.test(withoutBrackets.slice(0, trailing.index)))
        segments.push(trailing[1]);

    const meaningful = segments
        .map(segment => segment.toLowerCase().trim())
        .filter(segment => !CREDIT.test(segment) && !PROVENANCE.test(segment) && !isCredit(segment, credits))
        .map(segment => {
            let result = segment;

            for (const word of [...filterOutWords, ...STRUCTURAL])
                result = removeWord(result, word);

            return result
                .replace(YEAR, ' ')
                .replace(/[^\d a-z]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        })
        .filter(segment => segment.length >= MIN_QUALIFIER_LENGTH);

    return meaningful.join(' ');
}

/**
 * Whether two titles name the same version. Duration cannot separate two
 * different remixes of equal length, so this compares what the titles claim.
 * `credits` are the acts credited on the track being looked for, which is what
 * tells a collaborator apart from a remixer. Only ever the wanted track's own
 * credits: the candidate is what is on trial here, so letting its artist tag
 * vouch for a qualifier lets "Return of the Mack (Mark Morrison vs. Bad
 * Royale)" pass as a credit. Takes its noise words as an argument - callers
 * outside a search have no music-search state set yet.
 */
export function versionsMatch(a: string, b: string, filterOutWords: string[], credits: string[] = []) {
    const versionA = extractVersion(a, filterOutWords, credits);
    const versionB = extractVersion(b, filterOutWords, credits);

    // Only one side bracketing the version is not a disagreement about it
    const match = versionA === versionB
        || (!versionB && titleStatesVersion(b, versionA))
        || (!versionA && titleStatesVersion(a, versionB));

    // One side naming a version the other does not is the mismatch worth
    // catching: "Language" offered for "Language - UK Edit"
    const contains = !!versionA && !!versionB && (versionA.includes(versionB) || versionB.includes(versionA));

    return { match, contains, similarity: match ? 1 : 0 };
}

export function compareVersions(a?: string, b?: string, credits: string[] = []) {
    if (!a || !b)
        return { match: false, contains: false, similarity: 0 };

    return versionsMatch(a, b, getState().musicSearchConfig?.textProcessing?.filterOutWords ?? [], credits);
}
