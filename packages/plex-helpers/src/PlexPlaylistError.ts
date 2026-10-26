export class PlexPlaylistError extends Error {
    public constructor(message: string = 'Plex playlist operation failed', options?: ErrorOptions) {
        super(message, options);
        this.name = 'PlexPlaylistError';
    }
}