import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const published: { topic: string; message: string }[] = [];
const publish = vi.fn(async (topic: string, message: string) => { published.push({ topic, message }) });
vi.mock('../services/mqtt/createMQTTClient', () => ({
    createMQTTClient: () => ({ connect: vi.fn(), disconnect: vi.fn(), publish, isConnected: () => true })
}));

const getById = vi.fn();
vi.mock('@spotify-to-plex/plex-music-search/functions/getById', () => ({ getById }));

const { PlexItemMissingError } = await import('@spotify-to-plex/plex-music-search/utils/PlexItemMissingError');
const { syncMQTT } = await import('../jobs/mqtt');

let dir: string;

const write = (name: string, data: unknown) => writeFileSync(join(dir, name), JSON.stringify(data));
const saved = (id: string, plexId: number) => ({ type: 'plex-media', uri: `/library/metadata/${plexId}`, id, title: id, label: 'Mood' });
const previous = (id: string) => ({ id, entity_id: `sensor.spotify_to_plex_item_${id}`, category: 'Mood' });

// An entity is removed by publishing an empty retained state
const removed = () => published
    .filter(({ topic, message }) => message === '' && topic.endsWith('/state'))
    .map(({ topic }) => topic.split('/')[2]);
const kept = () => (JSON.parse(readFileSync(join(dir, 'mqtt_published_items.json'), 'utf8')) as { id: string }[]).map(item => item.id);

// The cleanup removes what was published last time and is gone now: an item that only
// failed this run is still there, and deleting it empties a Home Assistant dashboard
describe('syncMQTT cleanup', () => {
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'mqtt-cleanup-'));
        process.env.STORAGE_DIR = dir;
        process.env.MQTT_BROKER_URL = 'mqtt://broker.test';
        published.length = 0;
        publish.mockClear();
        getById.mockReset();
        getById.mockResolvedValue({ image: '/thumb' });

        write('plex.json', { id: 'server', uri: 'http://plex.test:32400', token: 'token' });
        write('spotify_saved_items.json', [saved('kept', 1), saved('flaky', 2), saved('deleted', 3)]);
        write('mqtt_published_items.json', [previous('kept'), previous('flaky'), previous('deleted'), previous('unsaved')]);

        vi.spyOn(console, 'log').mockImplementation(() => { /* expected */ });
        vi.spyOn(console, 'warn').mockImplementation(() => { /* expected */ });
        vi.spyOn(console, 'error').mockImplementation(() => { /* expected */ });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        rmSync(dir, { recursive: true, force: true });
        delete process.env.STORAGE_DIR;
        delete process.env.MQTT_BROKER_URL;
    });

    it('keeps an entity when Plex fails to answer, and removes one Plex no longer has', async () => {
        getById.mockImplementation(async (_config: unknown, key: string) => {
            if (key.endsWith('/2'))
                throw new Error('read ECONNRESET');

            if (key.endsWith('/3'))
                throw new PlexItemMissingError(key);

            return { image: '/thumb' };
        });

        await syncMQTT();

        expect(removed()).toEqual(['deleted', 'unsaved']);
        expect(kept()).toEqual(['kept', 'flaky']);
    });

    it('keeps an entity whose publish failed, as the broker still holds the last one', async () => {
        publish.mockImplementation(async (topic: string, message: string) => {
            if (topic.includes('flaky') && message !== '')
                throw new Error('publish timed out');

            published.push({ topic, message });
        });

        await syncMQTT();

        expect(removed()).toEqual(['unsaved']);
        expect(kept()).toEqual(['kept', 'flaky', 'deleted']);
    });

    it('does not keep an item that was never published', async () => {
        write('mqtt_published_items.json', [previous('kept')]);
        getById.mockImplementation(async (_config: unknown, key: string) => {
            if (key.endsWith('/1'))
                return { image: '/thumb' };

            throw new Error('read ECONNRESET');
        });

        await syncMQTT();

        expect(removed()).toEqual([]);
        expect(kept()).toEqual(['kept']);
    });
});
