// Type for missing_tracks_slskd.json (playlists job) and missing_albums_slskd.json (albums job)
export type SlskdTrackData = {
    spotify_id: string;
    artist_name: string;
    track_name: string;
    album_name?: string;
    // What a candidate file's length is checked against; absent in lists written before it was added
    duration_ms?: number;
};
