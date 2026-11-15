/** A change refused because a sync it would race is running: the caller can ask again once that sync ends. */
export class SyncRunningError extends Error {
    public constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'SyncRunningError';
    }
}
