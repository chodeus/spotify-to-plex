import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCachedTrackLinks } from './getCachedTrackLink';

const track = { id: 'spotify-1', title: 'Song', artists: ['Artist'] };

function storedLink(dir: string) {
    return JSON.parse(readFileSync(join(dir, 'track_links.json'), 'utf8'))[0];
}

describe('getCachedTrackLinks add', () => {
    let dir: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'track-links-'));
        process.env.STORAGE_DIR = dir;
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
        delete process.env.STORAGE_DIR;
    });

    it('records an ISRC match on the plex link', () => {
        getCachedTrackLinks([track], 'plex').add([{ id: 'spotify-1', title: 'Song', artist: 'Artist', result: [{ id: '/library/metadata/1' }], matched_by: 'isrc' }], 'plex');

        expect(storedLink(dir)).toMatchObject({ plex_id: ['/library/metadata/1'], plex_matched_by: 'isrc' });
    });

    // Otherwise a title match made later would skip the version check meant for it
    it('clears the ISRC mark when a later search replaces the link', () => {
        getCachedTrackLinks([track], 'plex').add([{ id: 'spotify-1', title: 'Song', artist: 'Artist', result: [{ id: '/library/metadata/1' }], matched_by: 'isrc' }], 'plex');
        getCachedTrackLinks([track], 'plex').add([{ id: 'spotify-1', title: 'Song', artist: 'Artist', result: [{ id: '/library/metadata/2' }] }], 'plex');

        expect(storedLink(dir).plex_id).toEqual(['/library/metadata/2']);
        expect(storedLink(dir)).not.toHaveProperty('plex_matched_by');
    });
});
