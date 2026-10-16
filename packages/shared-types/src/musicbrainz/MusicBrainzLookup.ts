/**
 * The outcome of resolving a Spotify album to MusicBrainz. "not-found" means
 * MusicBrainz answered and had nothing; "unavailable" means it never answered,
 * which is not the same thing and must not be remembered as a miss.
 */
export type MusicBrainzLookup =
    // releaseId: the release Spotify's album URL is linked to; absent when only the name search matched
    | { status: 'found'; releaseGroupId: string; artistId: string; releaseId?: string }
    | { status: 'not-found' }
    | { status: 'unavailable' };
