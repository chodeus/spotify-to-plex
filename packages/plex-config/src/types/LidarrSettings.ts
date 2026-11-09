export type LidarrSettings = {
    enabled: boolean;
    url: string;
    root_folder_path: string;
    quality_profile_id: number;
    metadata_profile_id: number;
    auto_sync: boolean;
    /**
     * Pin Spotify's edition and let Lidarr import no other. Off (absent) by default: downloads come from
     * slskd, Deezer or Tidal, whose edition of the same album often differs from Spotify's, and Lidarr
     * then refuses the import with "Album release not requested".
     */
    pin_spotify_release?: boolean;
};
