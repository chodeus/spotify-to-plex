import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// The workspace packages publish wildcard subpath exports that resolve into
// dist. Point them at source instead so a test run does not depend on the
// packages having been built first.
const workspace = (name: string) => ({
    find: new RegExp(`^@spotify-to-plex/${name}/(.*)$`),
    replacement: resolve(import.meta.dirname, `../../packages/${name}/src/$1`)
});

export default defineConfig({
    resolve: {
        alias: [
            workspace('shared-utils'),
            workspace('shared-types'),
            workspace('music-search'),
            workspace('plex-music-search'),
            workspace('plex-config'),
            workspace('plex-helpers'),
            workspace('http-client')
        ]
    }
});
