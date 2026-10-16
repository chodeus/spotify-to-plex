import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { musicBrainzGet } from './utils/musicBrainzGet';
import { getMusicBrainzIdsByTextSearch } from './getMusicBrainzIdsByTextSearch';
import { getMusicBrainzIds } from './getMusicBrainzIds';

vi.mock('./utils/musicBrainzGet', () => ({ musicBrainzGet: vi.fn() }));
vi.mock('./getMusicBrainzIdsByTextSearch', () => ({ getMusicBrainzIdsByTextSearch: vi.fn() }));
vi.mock('./utils/isTransientError', () => ({ isTransientError: (error: { transient?: boolean }) => error?.transient === true }));

const getMock = musicBrainzGet as unknown as Mock;
const textSearchMock = getMusicBrainzIdsByTextSearch as unknown as Mock;

// The URL lookup: Spotify's album URL names a release, and the release names its group and artist
function musicBrainzLinks(releaseId: string | null, releaseGroupId = 'rg-url') {
    getMock.mockImplementation(async (url: string) => {
        if (url.includes('/ws/2/url?')) {
            if (!releaseId)
                throw Object.assign(new Error('Request failed with status code 404'), { transient: false });

            return { data: { relations: [{ direction: 'backward', 'target-type': 'release', release: { id: releaseId } }] } };
        }

        return { data: { 'release-group': { id: releaseGroupId }, 'artist-credit': [{ artist: { id: 'ar-1' } }] } };
    });
}

describe('getMusicBrainzIds', () => {
    let dir: string;
    const links = () => JSON.parse(readFileSync(join(dir, 'album_musicbrainz_links.json'), 'utf8'));
    const cacheHolds = (entry: object) => writeFileSync(join(dir, 'album_musicbrainz_links.json'), JSON.stringify([{ spotify_album_id: 'sp-1', musicbrainz_release_group_id: 'rg-cached', musicbrainz_artist_id: 'ar-cached', cached_at: 1, ...entry }]));

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'mb-ids-'));
        process.env.STORAGE_DIR = dir;
        getMock.mockReset();
        textSearchMock.mockReset();
    });

    afterEach(() => { rmSync(dir, { recursive: true, force: true }) });

    it("returns and caches the release Spotify's album URL is linked to", async () => {
        musicBrainzLinks('rel-1');

        expect(await getMusicBrainzIds('sp-1', 'Artist', 'Album')).toEqual({ status: 'found', releaseGroupId: 'rg-url', artistId: 'ar-1', releaseId: 'rel-1' });
        expect(links()[0]).toMatchObject({ musicbrainz_release_group_id: 'rg-url', musicbrainz_release_id: 'rel-1' });
    });

    it('caches a name-search match as having no release', async () => {
        musicBrainzLinks(null);
        textSearchMock.mockResolvedValue({ status: 'found', releaseGroupId: 'rg-text', artistId: 'ar-2' });

        const found = await getMusicBrainzIds('sp-1', 'Artist', 'Album');

        expect(found).toMatchObject({ releaseGroupId: 'rg-text' });
        expect(found).not.toHaveProperty('releaseId', expect.anything());
        expect(links()[0]).toMatchObject({ musicbrainz_release_group_id: 'rg-text', musicbrainz_release_id: null });
    });

    it('serves a cached release without asking MusicBrainz', async () => {
        cacheHolds({ musicbrainz_release_id: 'rel-cached' });

        expect(await getMusicBrainzIds('sp-1')).toEqual({ status: 'found', releaseGroupId: 'rg-cached', artistId: 'ar-cached', releaseId: 'rel-cached' });
        expect(getMock).not.toHaveBeenCalled();
    });

    it('serves a cached "no release" without asking MusicBrainz', async () => {
        cacheHolds({ musicbrainz_release_id: null });

        expect(await getMusicBrainzIds('sp-1')).toEqual({ status: 'found', releaseGroupId: 'rg-cached', artistId: 'ar-cached', releaseId: undefined });
        expect(getMock).not.toHaveBeenCalled();
    });

    describe('an entry cached before releases were kept', () => {
        it('takes the URL lookup in full when one is on file', async () => {
            cacheHolds({});
            musicBrainzLinks('rel-1');

            expect(await getMusicBrainzIds('sp-1')).toMatchObject({ releaseGroupId: 'rg-url', releaseId: 'rel-1' });
            expect(links()).toEqual([expect.objectContaining({ musicbrainz_release_group_id: 'rg-url', musicbrainz_release_id: 'rel-1' })]);
        });

        it('keeps its mapping, now marked as having no release, when no URL is on file', async () => {
            cacheHolds({});
            musicBrainzLinks(null);

            expect(await getMusicBrainzIds('sp-1')).toEqual({ status: 'found', releaseGroupId: 'rg-cached', artistId: 'ar-cached', releaseId: undefined });
            expect(links()[0]).toMatchObject({ musicbrainz_release_group_id: 'rg-cached', musicbrainz_release_id: null });
            expect(textSearchMock).not.toHaveBeenCalled();
        });

        it('keeps its mapping and stays unfilled when MusicBrainz does not answer', async () => {
            cacheHolds({});
            getMock.mockRejectedValue(Object.assign(new Error('timeout'), { transient: true }));

            expect(await getMusicBrainzIds('sp-1')).toMatchObject({ status: 'found', releaseGroupId: 'rg-cached' });
            expect(links()[0]).not.toHaveProperty('musicbrainz_release_id');
        });
    });
});
