import { TextProcessingConfig } from "../types/TextProcessingConfig";

export function filterOutWords(input: string, textProcessing: TextProcessingConfig, filtered: boolean = false, cutOffSeperators: boolean = false, removeQuotes = false) {

    let result = input.toLowerCase();
    const {
        filterOutWords: words,
        filterOutQuotes: quotes,
        cutOffSeparators: separators
    } = textProcessing;
    if (filtered)
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            if (word) {
                result = result.split(word).join("");
            }
        }

    if (removeQuotes)
        for (let i = 0; i < quotes.length; i++) {
            const quote = quotes[i];
            if (quote) {
                result = result.split(quote).join("");
            }
        }

    // Remove empty brackets
    result = result.split("()").join("");

    if (cutOffSeperators)
        for (let i = 0; i < separators.length; i++) {
            const separator = separators[i];
            const at = separator ? separatorAt(result, separator) : -1;
            if (separator && at > 0) {
                // Cut at the first occurrence for a comma separator or a short title, at the last for others
                const cutIndex = separator.includes(",") || at <= 4 ? at : result.lastIndexOf(separator);
                result = result.slice(0, Math.max(0, cutIndex));
            }
        }

    result = result.trim();
    // Remove trailing dashes or starting dashes
    while (result.length > 3 && result.endsWith('-'))
        result = result.slice(0, -1).trim();

    while (result.length > 3 && result.startsWith('-'))
        result = result.slice(1).trim();

    return result;
}

/** Where a separator cuts: past the fifth character, or where a space sets it off ("679 (feat. x)", not "x-ray") */
function separatorAt(text: string, separator: string) {
    for (let at = text.indexOf(separator, 1); at > 0; at = text.indexOf(separator, at + 1))
        if (at > 4 || /\s/.test(text.charAt(at - 1)) || /^\s/.test(separator))
            return at;

    return -1;
}
