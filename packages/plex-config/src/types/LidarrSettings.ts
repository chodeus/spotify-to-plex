export type LidarrSettings = {
    enabled: boolean;
    url: string;
    root_folder_path: string;
    quality_profile_id: number;
    metadata_profile_id: number;
    auto_sync: boolean;
    /** Pin Spotify's edition so Lidarr imports no other; off (absent) by default. */
    pin_spotify_release?: boolean;
};
