import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TrackLink } from '@spotify-to-plex/shared-types/common/track';
import { getCachedTrackLinks } from './getCachedTrackLink';
import { setManualTrackLink } from './setManualTrackLink';

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

    // The weekly re-check counts from the last search that confirmed the link
    it('stamps when a search wrote the link', () => {
        const before = Date.now();
        getCachedTrackLinks([track], 'plex').add([{ id: 'spotify-1', title: 'Song', artist: 'Artist', result: [{ id: '/library/metadata/1' }] }], 'plex');

        expect(storedLink(dir).plex_checked_at).toBeGreaterThanOrEqual(before);
    });

    it('stamps a link a re-check confirmed, leaving its tracks as they were', () => {
        writeFileSync(join(dir, 'track_links.json'), JSON.stringify([{ spotify_id: 'spotify-1', plex_id: ['/library/metadata/1'], plex_checked_at: 1 }]));
        const before = Date.now();

        getCachedTrackLinks([track], 'plex').markChecked(['spotify-1']);

        expect(storedLink(dir)).toMatchObject({ plex_id: ['/library/metadata/1'] });
        expect(storedLink(dir).plex_checked_at).toBeGreaterThanOrEqual(before);
    });
});

// A sync holds its links for minutes while the web app keeps writing the same file
describe('getCachedTrackLinks save', () => {
    let dir: string;
    const linksPath = () => join(dir, 'track_links.json');
    const stored = (): TrackLink[] => JSON.parse(readFileSync(linksPath(), 'utf8'));
    const result = (id: string, plexId: string) => ({ id, title: 'Song', artist: 'Artist', result: [{ id: plexId }] });

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'track-links-'));
        process.env.STORAGE_DIR = dir;
        writeFileSync(linksPath(), JSON.stringify([
            { spotify_id: 'a', plex_id: ['/library/metadata/1'] },
            { spotify_id: 'b', plex_id: ['/library/metadata/2'] }
        ]));
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
        delete process.env.STORAGE_DIR;
    });

    it('keeps a link written by someone else since the read', () => {
        const links = getCachedTrackLinks([{ id: 'c', title: 'Song', artists: ['Artist'] }], 'plex');
        setManualTrackLink('b', '/library/metadata/9');

        links.add([result('c', '/library/metadata/3')], 'plex');

        expect(stored()).toEqual([
            { spotify_id: 'a', plex_id: ['/library/metadata/1'] },
            { spotify_id: 'b', plex_id: ['/library/metadata/9'], manual: true },
            { spotify_id: 'c', plex_id: ['/library/metadata/3'], plex_checked_at: expect.any(Number) }
        ]);
    });

    it('never replaces a manual pick made since the read', () => {
        const links = getCachedTrackLinks([{ id: 'a', title: 'Song', artists: ['Artist'] }], 'plex');
        setManualTrackLink('a', '/library/metadata/9');

        links.add([result('a', '/library/metadata/5')], 'plex');

        expect(stored()[0]).toEqual({ spotify_id: 'a', plex_id: ['/library/metadata/9'], manual: true });
    });

    // getCachedPlexTracks frees a manual pick whose Plex tracks are all gone
    it('saves a manual link this run read and cleared itself', () => {
        setManualTrackLink('b', '/library/metadata/2');
        const links = getCachedTrackLinks([{ id: 'b', title: 'Song', artists: ['Artist'] }], 'plex');
        const [link] = links.found;
        if (link) {
            link.plex_id = [];
            delete link.manual;
        }

        links.save();

        expect(stored()[1]).toEqual({ spotify_id: 'b', plex_id: [] });
    });

    it('writes a pruned link that add() never touched', () => {
        const links = getCachedTrackLinks([{ id: 'b', title: 'Song', artists: ['Artist'] }], 'plex');
        const [link] = links.found;
        if (link)
            link.plex_id = [];

        links.save();

        expect(stored()[1]).toEqual({ spotify_id: 'b', plex_id: [] });
    });
});
