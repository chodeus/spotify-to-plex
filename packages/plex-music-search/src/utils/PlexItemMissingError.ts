/** Plex answered, and no longer has the item: unlike an unreachable server, retrying will not bring it back. */
export class PlexItemMissingError extends Error {
    public constructor(key: string, options?: ErrorOptions) {
        super(`Plex no longer has ${key}`, options);
        this.name = 'PlexItemMissingError';
    }
}
