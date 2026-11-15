export const BLANK_TITLE = 'The title cannot be blank';
export const INVALID_PLAYLIST = 'Invalid data given';

/** Why a playlist write's body cannot go to Plex, or undefined when it can. */
export function playlistWriteError({ id, name, items }: { id?: unknown, name?: unknown, items?: unknown }) {
    if (!Array.isArray(items) || items.length === 0 || typeof name !== 'string' || typeof id !== 'string')
        return INVALID_PLAYLIST;

    // Plex would name the playlist with nothing readable
    return name.trim() ? undefined : BLANK_TITLE;
}
