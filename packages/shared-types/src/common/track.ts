export type TrackLink = {
    spotify_id: string
    // Chosen by a person, so the duration guard must leave it alone
    manual?: boolean
    // Matched on the ISRC's MusicBrainz track id, so the title-based version check must leave it alone
    plex_matched_by?: 'isrc'
    plex_id?: string[]
    tidal_id?: string[]
    slskd_files?: {
        username: string;
        filename: string;
        size: number;
    }[]
}