import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncSlskd } from '../jobs/slskd';

let dir: string;

const syncStatus = () => JSON.parse(readFileSync(join(dir, 'sync_type_log.json'), 'utf8')).slskd;
const settings = (url = 'http://slskd.test') => writeFileSync(join(dir, 'slskd.json'), JSON.stringify({ enabled: true, url, allowed_extensions: ['flac'], search_timeout: 5, max_results: 30, download_attempts: 3, auto_sync: true }));

// Every way the job can end before it searches settles its status
describe('syncSlskd status', () => {
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'slskd-status-'));
        process.env.STORAGE_DIR = dir;
        process.env.SLSKD_API_KEY = 'fake-key';
        vi.spyOn(console, 'log').mockImplementation(() => { /* expected */ });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        rmSync(dir, { recursive: true, force: true });
        delete process.env.STORAGE_DIR;
        delete process.env.SLSKD_API_KEY;
    });

    it('completes when there is nothing to search for', async () => {
        settings();

        await syncSlskd();

        expect(syncStatus().status).toBe('success');
    });

    it('errors when no slskd URL is set', async () => {
        settings('');

        await syncSlskd();

        expect(syncStatus()).toMatchObject({ status: 'error', error: 'SLSKD URL not configured' });
    });

    it('errors when the API key is missing', async () => {
        settings();
        delete process.env.SLSKD_API_KEY;

        await syncSlskd();

        expect(syncStatus()).toMatchObject({ status: 'error', error: 'SLSKD_API_KEY not set' });
    });

    it('errors when a missing list cannot be read', async () => {
        settings();
        writeFileSync(join(dir, 'missing_tracks_slskd.json'), '{ not json');

        await expect(syncSlskd()).rejects.toThrow('Failed to parse missing_tracks_slskd.json');

        expect(syncStatus()).toMatchObject({ status: 'error', error: 'Failed to parse missing_tracks_slskd.json' });
    });
});
