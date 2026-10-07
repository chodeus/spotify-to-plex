// Only a credit ("feat. X", "ft. X", "featuring X"): a bare "feat" substring cut "Undefeated" to "Unde"
const CREDIT = /[\s([](?:feat\.?|featuring|ft\.)\s.*$/i;

export function removeFeaturing(result = "") {
    let trimmed = result.replace(CREDIT, '');

    if (trimmed.indexOf('(') > -1)
        trimmed = trimmed.slice(0, Math.max(0, trimmed.indexOf('(')));

    return trimmed.trimEnd();
}
