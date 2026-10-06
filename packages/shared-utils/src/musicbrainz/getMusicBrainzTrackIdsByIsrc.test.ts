import { linkSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('../lidarr/utils/musicBrainzGet', () => ({ musicBrainzGet: vi.fn() }));

const { musicBrainzGet } = await import('../lidarr/utils/musicBrainzGet');
const { getMusicBrainzTrackIdsByIsrc } = await import('./getMusicBrainzTrackIdsByIsrc');

const getMock = musicBrainzGet as unknown as Mock;
const ISRC = 'XXA000000001';

function searchResponse() {
    return {
        data: {
            recordings: [{
                id: 'recording-1',
                releases: [
                    { title: 'Album A', media: [{ track: [{ id: 'track-a1' }] }] },
                    { title: 'Compilation', media: [{ track: [{ id: 'track-c1' }] }] },
                    { title: 'Album A', media: [{ track: [{ id: 'track-a2' }] }] }
                ]
            }]
        }
    };
}

describe('getMusicBrainzTrackIdsByIsrc', () => {
    let dir: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'isrc-cache-'));
        process.env.STORAGE_DIR = dir;
        getMock.mockReset();
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
        delete process.env.STORAGE_DIR;
    });

    it('collects every release track id and release title', async () => {
        getMock.mockResolvedValue(searchResponse());

        const result = await getMusicBrainzTrackIdsByIsrc(ISRC);

        expect(result).toEqual({
            status: 'found',
            trackIds: ['track-a1', 'track-c1', 'track-a2'],
            releaseTitles: ['Album A', 'Compilation']
        });
        expect(getMock.mock.calls[0]?.[0]).toContain(`query=isrc:${ISRC}`);
    });

    it('answers a repeat lookup from the cache', async () => {
        getMock.mockResolvedValue(searchResponse());

        await getMusicBrainzTrackIdsByIsrc(ISRC);
        const again = await getMusicBrainzTrackIdsByIsrc(ISRC);

        expect(getMock).toHaveBeenCalledTimes(1);
        expect(again.status).toBe('found');
    });

    it('remembers an answer with no recordings as not-found', async () => {
        getMock.mockResolvedValue({ data: { recordings: [] } });

        const first = await getMusicBrainzTrackIdsByIsrc(ISRC);
        const second = await getMusicBrainzTrackIdsByIsrc(ISRC);

        expect([first.status, second.status]).toEqual(['not-found', 'not-found']);
        expect(getMock).toHaveBeenCalledTimes(1);
    });

    // A failed request says nothing about the ISRC, so it must not reach the cache
    it('never caches a failed request', async () => {
        getMock.mockRejectedValueOnce(new Error('500'));
        getMock.mockResolvedValueOnce(searchResponse());

        const failed = await getMusicBrainzTrackIdsByIsrc(ISRC);
        const retried = await getMusicBrainzTrackIdsByIsrc(ISRC);

        expect([failed.status, retried.status]).toEqual(['unavailable', 'found']);
        expect(getMock).toHaveBeenCalledTimes(2);
    });

    it('refuses a malformed ISRC without asking MusicBrainz', async () => {
        const result = await getMusicBrainzTrackIdsByIsrc('nope OR isrc:*');

        expect(result.status).toBe('not-found');
        expect(getMock).not.toHaveBeenCalled();
    });

    it('re-asks once the cached answer has expired', async () => {
        getMock.mockResolvedValue(searchResponse());
        const now = Date.now();
        const clock = vi.spyOn(Date, 'now').mockReturnValue(now);

        await getMusicBrainzTrackIdsByIsrc(ISRC);
        clock.mockReturnValue(now + 15 * 24 * 60 * 60 * 1000);
        await getMusicBrainzTrackIdsByIsrc(ISRC);

        clock.mockRestore();
        expect(getMock).toHaveBeenCalledTimes(2);
        expect(JSON.parse(readFileSync(join(dir, 'isrc_musicbrainz_tracks.json'), 'utf8'))).toHaveLength(1);
    });

    it('starts over from a torn cache file', async () => {
        const cachePath = join(dir, 'isrc_musicbrainz_tracks.json');
        writeFileSync(cachePath, '[{"isrc": "XXA00');
        getMock.mockResolvedValue(searchResponse());

        const result = await getMusicBrainzTrackIdsByIsrc(ISRC);

        expect(result.status).toBe('found');
        expect(JSON.parse(readFileSync(cachePath, 'utf8'))).toHaveLength(1);
    });

    // A hard link keeps the old inode, so it only changes if the write went into the file in place
    it('replaces the cache file instead of writing into it', async () => {
        const cachePath = join(dir, 'isrc_musicbrainz_tracks.json');
        getMock.mockResolvedValue(searchResponse());
        await getMusicBrainzTrackIdsByIsrc(ISRC);
        const before = readFileSync(cachePath, 'utf8');
        linkSync(cachePath, join(dir, 'old-inode'));

        await getMusicBrainzTrackIdsByIsrc('XXA000000002');

        expect(readFileSync(join(dir, 'old-inode'), 'utf8')).toBe(before);
        expect(JSON.parse(readFileSync(cachePath, 'utf8'))).toHaveLength(2);
        expect(readdirSync(dir).sort()).toEqual(['isrc_musicbrainz_tracks.json', 'old-inode']);
    });
});
