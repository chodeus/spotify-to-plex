// Only a credit: "feat." or "featuring" in any case, and "ft." in lower case only, so "Ft. Worth" stays.
// A bare "feat" counts only in brackets: "Undefeated" lost its end to it, and "Little Feat" is a band
const CREDIT = /\s(?:feat\.|featuring\b).*$/i;
const SHORT_CREDIT = /\sft\..*$/;
const BRACKETED_CREDIT = /\s*[([]\s*(?:feat|ft|featuring)\b.*$/i;

export function removeFeaturing(result = "") {
    let trimmed = result.replace(BRACKETED_CREDIT, '')
        .replace(CREDIT, '')
        .replace(SHORT_CREDIT, '');

    if (trimmed.indexOf('(') > -1)
        trimmed = trimmed.slice(0, Math.max(0, trimmed.indexOf('(')));

    return trimmed.trimEnd();
}
