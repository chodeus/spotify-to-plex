/** An album the Lidarr sync could not map to MusicBrainz, kept across runs until it maps or stops being missing. */
export type UnmappedAlbum = {
    spotify_album_id: string;
    artist_name: string;
    album_name: string;
    first_seen: number;
    last_checked: number;
    attempts: number;
    dismissed?: boolean;
};

/** Keyed by spotify_album_id. */
export type UnmappedAlbums = Record<string, UnmappedAlbum>;
