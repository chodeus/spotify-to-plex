import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const connect = vi.fn();
const disconnect = vi.fn(async () => { /* nothing to close */ });
vi.mock('../services/mqtt/createMQTTClient', () => ({
    createMQTTClient: () => ({ connect, disconnect, publish: vi.fn(), isConnected: () => false })
}));

const { syncMQTT } = await import('../jobs/mqtt');

let dir: string;

const syncStatus = () => JSON.parse(readFileSync(join(dir, 'sync_type_log.json'), 'utf8')).mqtt;
const plex = () => writeFileSync(join(dir, 'plex.json'), JSON.stringify({ id: 'server', uri: 'http://plex.test:32400', token: 'token' }));

// A failure before publishing starts settles the status too, rather than leaving it "running"
describe('syncMQTT status', () => {
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'mqtt-status-'));
        vi.stubEnv('STORAGE_DIR', dir);
        vi.stubEnv('MQTT_BROKER_URL', 'mqtt://broker.test');
        // A dry run never connects, so the broker test would fail on the missing data files instead
        vi.stubEnv('MQTT_DRY_RUN', 'false');
        connect.mockReset();
        disconnect.mockClear();
        vi.spyOn(console, 'log').mockImplementation(() => { /* expected */ });
        vi.spyOn(console, 'error').mockImplementation(() => { /* expected */ });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
        rmSync(dir, { recursive: true, force: true });
    });

    it('errors when there is no Plex connection', async () => {
        await expect(syncMQTT()).rejects.toThrow('No Plex connection found');

        expect(syncStatus()).toMatchObject({ status: 'error', error: 'No Plex connection found' });
        expect(connect).not.toHaveBeenCalled();
    });

    it('errors when the broker cannot be reached', async () => {
        plex();
        connect.mockRejectedValue(new Error('connect ECONNREFUSED'));

        await expect(syncMQTT()).rejects.toThrow('Failed to connect to MQTT broker');

        expect(syncStatus()).toMatchObject({ status: 'error', error: 'Failed to connect to MQTT broker' });
    });
});
