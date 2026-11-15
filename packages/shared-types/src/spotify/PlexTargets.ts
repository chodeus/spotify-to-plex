/** What a synced playlist becomes in Plex; a saved item without one is a playlist. */
export const PLEX_TARGETS = ['playlist', 'collection', 'both'] as const;

/** What a saved item becomes in Plex; a missing or unknown value makes only the playlist. */
export function plexTargetOf(item: { plex_target?: unknown }) {
    return PLEX_TARGETS.find(target => target === item.plex_target) ?? 'playlist';
}
