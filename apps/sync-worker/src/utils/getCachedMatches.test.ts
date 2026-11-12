import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { PlexMusicSearchConfig } from '@spotify-to-plex/plex-music-search/types/PlexMusicSearchConfig';

vi.mock('@spotify-to-plex/plex-music-search/functions/getById', () => ({ getById: vi.fn() }));

// The web helper behind /api/plex/tracks and /api/plex/cached: the web app has no test runner of its own
const { getCachedMatches } = await import('../../../web/src/helpers/plex/getCachedMatches');
const { getById } = await import('@spotify-to-plex/plex-music-search/functions/getById');
const { PlexItemMissingError } = await import('@spotify-to-plex/plex-music-search/utils/PlexItemMissingError');

const getByIdMock = getById as unknown as Mock;
const config = { uri: 'http://plex.test:32400', token: 'token' } as PlexMusicSearchConfig;
const item = { id: 't1', title: 'Song', artists: ['Artist'], album: 'Album' };
let dir: string;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cached-matches-'));
    vi.stubEnv('STORAGE_DIR', dir);
    writeFileSync(join(dir, 'track_links.json'), JSON.stringify([{ spotify_id: 't1', plex_id: ['/library/metadata/9'], manual: true }]));
    getByIdMock.mockReset();
});

afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
});

describe('getCachedMatches hand picks', () => {
    it('hands back a hand pick Plex has', async () => {
        getByIdMock.mockResolvedValue({ id: '/library/metadata/9', title: 'Song' });

        const [match] = await getCachedMatches([item], config, true);

        expect(match?.result.map(track => track.id)).toEqual(['/library/metadata/9']);
    });

    it('drops a hand pick Plex no longer has, so the search can match it', async () => {
        getByIdMock.mockRejectedValue(new PlexItemMissingError('/library/metadata/9'));

        await expect(getCachedMatches([item], config, true)).resolves.toEqual([]);
    });

    // An automatic match would take the hand pick's place in the refresh
    it('fails when Plex does not answer for a hand pick', async () => {
        getByIdMock.mockRejectedValue(new Error('connect ETIMEDOUT'));

        await expect(getCachedMatches([item], config, true)).rejects.toThrow('Plex did not answer');
    });
});
