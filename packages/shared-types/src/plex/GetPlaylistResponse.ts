import { Playlist } from './Playlist';

export type GetPlaylistResponse = {
    MediaContainer: {
        size: number
        // Plex leaves it out when there are none
        Metadata?: Playlist[]
    }
}