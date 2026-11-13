export type SpotifyUser = {
    id: string,
    name: string,
    sync?: boolean
    label?: string
    recentContext?: boolean
    // Playlists for this user's items are made as this Plex Home user
    plex_home_user?: { uuid: string, title: string }
}