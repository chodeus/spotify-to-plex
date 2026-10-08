import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Mirrors apps/sync-worker/vitest.config.ts: the built packages import without extensions, which Node will not load
export default defineConfig({
    resolve: {
        alias: [
            {
                find: /^@spotify-to-plex\/http-client\/(.*)$/,
                replacement: resolve(import.meta.dirname, '../http-client/src/$1')
            }
        ]
    }
});
