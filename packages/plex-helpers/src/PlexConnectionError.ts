export class PlexConnectionError extends Error {
    public constructor(message: string = 'No Plex connection found', options?: ErrorOptions) {
        super(message, options);
        this.name = 'PlexConnectionError';
    }
}