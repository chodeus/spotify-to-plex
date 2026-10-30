import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Mirrors plex-music-search/vitest.config.ts: the built packages import without extensions, which Node will not load
const workspace = (name: string) => ({
    find: new RegExp(`^@spotify-to-plex/${name}/(.*)$`),
    replacement: resolve(import.meta.dirname, `../${name}/src/$1`)
});

export default defineConfig({
    resolve: {
        alias: [
            workspace('shared-utils'),
            workspace('shared-types')
        ]
    }
});
