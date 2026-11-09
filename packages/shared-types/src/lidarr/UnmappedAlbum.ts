/**
 * Where an album that Lidarr cannot add yet is stuck:
 * - musicbrainz: MusicBrainz has no entry for it - import it (Harmony)
 * - lidarr: MusicBrainz has it, Lidarr's metadata server does not yet (it usually catches up in 2-3 hours)
 */
export type UnmappedStage = 'musicbrainz' | 'lidarr';

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
    dismissed?: boolean;
};

/** Keyed by spotify_album_id. */
export type UnmappedAlbums = Record<string, UnmappedAlbum>;
