/** Plex answered, and no longer has the item: unlike an unreachable server, retrying will not bring it back. */
export class PlexItemMissingError extends Error {
    public constructor(key: string) {
        super(`Plex no longer has ${key}`);
        this.name = 'PlexItemMissingError';
    }
}
