/**
 * 'musicbrainz': no MusicBrainz entry, import it; 'lidarr': in MusicBrainz, not yet on Lidarr's metadata server;
 * 'release_status': in MusicBrainz, but no release has a status, so Lidarr's metadata leaves them all out.
 */
export type UnmappedStage = 'musicbrainz' | 'lidarr' | 'release_status';

/** An album the Lidarr sync could not add for want of metadata, kept across runs until Lidarr takes it or it stops being missing. */
export type UnmappedAlbum = {
    spotify_album_id: string;
    artist_name: string;
    album_name: string;
    first_seen: number;
    last_checked: number;
    attempts: number;
    /** Absent in lists written before stages existed, which only held musicbrainz albums. */
    stage?: UnmappedStage;
    /** When a check first found it in MusicBrainz. */
    found_in_musicbrainz?: number;
    /** release_status only: the MusicBrainz releases to set a status on. */
    releases_without_status?: string[];
    dismissed?: boolean;
};

/** Keyed by spotify_album_id. */
export type UnmappedAlbums = Record<string, UnmappedAlbum>;
