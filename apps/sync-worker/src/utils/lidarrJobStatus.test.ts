import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { syncLidarr } from '../jobs/lidarr';

let dir: string;

const syncStatus = () => JSON.parse(readFileSync(join(dir, 'sync_type_log.json'), 'utf8')).lidarr;
const settings = (url = 'http://lidarr.test') => writeFileSync(join(dir, 'lidarr.json'), JSON.stringify({ enabled: true, url, root_folder_path: '/music', quality_profile_id: 1, metadata_profile_id: 1, auto_sync: true }));

// The overview showed "running" for ever after any of these early returns
describe('syncLidarr status', () => {
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'lidarr-status-'));
        process.env.STORAGE_DIR = dir;
        process.env.LIDARR_API_KEY = 'fake-key';
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
        delete process.env.STORAGE_DIR;
        delete process.env.LIDARR_API_KEY;
    });

    it('completes when there is nothing to send', async () => {
        settings();

        await syncLidarr();

        expect(syncStatus().status).toBe('success');
    });

    it('errors when no Lidarr URL is set', async () => {
        settings('');

        await syncLidarr();

        expect(syncStatus()).toMatchObject({ status: 'error', error: 'Lidarr URL not configured' });
    });

    it('errors when the API key is missing', async () => {
        settings();
        delete process.env.LIDARR_API_KEY;

        await syncLidarr();

        expect(syncStatus()).toMatchObject({ status: 'error', error: 'LIDARR_API_KEY not set' });
    });
});
