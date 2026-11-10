import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import axios from 'axios';

// Only HTTP is faked: storage, the MusicBrainz cache and the unmapped list are the real ones
vi.mock('axios', () => ({
    default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), isAxiosError: (error: { isAxiosError?: boolean }) => error?.isAxiosError === true }
}));
const getMock = axios.get as unknown as Mock;

const { syncLidarr } = await import('./lidarr');
const { clearUnmapped, setUnmappedDismissed, updateUnmappedAlbums } = await import('@spotify-to-plex/shared-utils/lidarr/unmappedAlbums');

const W = '4aawyAB9vmqN3uQ7FjRGTy';
const X = '72PfrevnGAsfQXknMYKGVu';
let dir: string;

const listed = (id: string, name: string) => ({ spotify_album_id: id, artist_name: 'Artist', album_name: name, first_seen: 1, last_checked: 1, attempts: 1, stage: 'lidarr' });
const readList = () => JSON.parse(readFileSync(join(dir, 'lidarr_unmapped_albums.json'), 'utf8'));

// The web process writes the list while the job is looking up X, after the job has dealt with W
const duringLookupOfX = (webWrite: () => void) => {
    getMock.mockImplementation(async (url: string) => {
        if (url.includes(`rg-${X}`))
            webWrite();

        return { data: [] };
    });
};

describe('syncLidarr and the "Not in MusicBrainz" list', () => {
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'lidarr-job-'));
        process.env.STORAGE_DIR = dir;
        process.env.LIDARR_API_KEY = 'key';
        writeFileSync(join(dir, 'lidarr.json'), JSON.stringify({ enabled: true, url: 'http://lidarr.test', root_folder_path: '/m', quality_profile_id: 1, metadata_profile_id: 1, auto_sync: true }));
        writeFileSync(join(dir, 'missing_albums_lidarr.json'), JSON.stringify([
            { artist_name: 'Artist', album_name: 'W', spotify_album_id: W },
            { artist_name: 'Artist', album_name: 'X', spotify_album_id: X }
        ]));
        // Both already mapped, so the job asks Lidarr straight away; its metadata has neither yet
        writeFileSync(join(dir, 'album_musicbrainz_links.json'), JSON.stringify([W, X].map(id => (
            { spotify_album_id: id, musicbrainz_release_group_id: `rg-${id}`, musicbrainz_artist_id: 'ar', musicbrainz_release_id: null, cached_at: Date.now() }
        ))));
        writeFileSync(join(dir, 'lidarr_unmapped_albums.json'), JSON.stringify({ [W]: listed(W, 'W'), [X]: listed(X, 'X') }));
        getMock.mockReset();
        vi.spyOn(console, 'log').mockImplementation(() => { /* expected */ });
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it('keeps a dismissal made while the job runs', async () => {
        duringLookupOfX(() => updateUnmappedAlbums(list => setUnmappedDismissed(list, W, true)));

        await syncLidarr();

        expect(readList()[W]).toMatchObject({ dismissed: true, stage: 'lidarr', attempts: 2 });
    }, 20_000);

    it('does not bring back an album a manual send cleared while the job runs', async () => {
        duringLookupOfX(() => updateUnmappedAlbums(list => clearUnmapped(list, W)));

        await syncLidarr();

        expect(readList()[W]).toBeUndefined();
        expect(readList()[X]).toMatchObject({ attempts: 2 });
    }, 20_000);
});
