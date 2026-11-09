// Pure link builders: the web client imports these, so nothing here may touch node:fs

const SPOTIFY_ID = /^[0-9A-Za-z]{22}$/;

/** The sources Harmony combines for an import, as its own form names them. */
const HARMONY_PROVIDERS = ['musicbrainz', 'discogs', 'deezer', 'spotify', 'tidal', 'qobuz', 'beatport'] as const;

/** A bare Spotify id: 22 base-62 characters, no uri or url around it. */
export function isSpotifyId(id: unknown): id is string {
    return typeof id === 'string' && SPOTIFY_ID.test(id);
}

/**
 * Harmony's import page for a Spotify album, or undefined when there is no usable id.
 * Harmony only takes release urls, so this is only ever given an album id - a track id
 * (missing_*_slskd.json holds those) would build a url Harmony rejects.
 */
export function harmonyImportUrl(spotifyAlbumId: string | undefined, region = 'US'): string | undefined {
    if (!isSpotifyId(spotifyAlbumId))
        return;

    const params = new URLSearchParams({
        url: `https://open.spotify.com/album/${spotifyAlbumId}`,
        gtin: '',
        region
    });

    // Harmony takes each provider named, even empty, as one to look the release up in too:
    // the others add what Spotify lacks (label, catalogue numbers, other editions' links)
    for (const provider of HARMONY_PROVIDERS)
        params.append(provider, '');

    return `https://harmony.pulsewidth.org.uk/release?${params.toString()}`;
}

/** MusicBrainz's release group search, to check for an entry before importing a duplicate. */
export function musicBrainzSearchUrl(artistName: string, albumName: string) {
    const params = new URLSearchParams({
        query: `${albumName} ${artistName}`.trim(),
        type: 'release_group',
        method: 'indexed'
    });

    return `https://musicbrainz.org/search?${params.toString()}`;
}
