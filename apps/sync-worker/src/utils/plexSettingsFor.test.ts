import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { plexTv } = vi.hoisted(() => ({ plexTv: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@spotify-to-plex/http-client/plexTvClient', () => ({ plexTvClient: plexTv }));
// getSettings(true) is the account as saved; without it the token is the owner's server token
vi.mock('@spotify-to-plex/plex-config/functions/getSettings', () => ({
    getSettings: async (raw?: boolean) => ({ id: 'machine', uri: 'http://plex.test:32400', token: raw ? 'owner-account' : 'owner-server' })
}));

const { plexSettingsForUser, plexSettingsForItem, findPickableHomeUser } = await import('@spotify-to-plex/plex-helpers/utils/plexSettingsFor');

let dir: string;
const write = (name: string, data: unknown) => { writeFileSync(join(dir, name), JSON.stringify(data)) };
const mapTo = (spotifyId: string, uuid?: string) => write('spotify.json', [
    { user: { id: 'owner-spotify', name: 'Dean' } },
    { user: { id: spotifyId, name: 'Faye', ...(uuid ? { plex_home_user: { uuid, title: 'Faye' } } : {}) } }
]);
const switchesTo = (userToken?: string) => plexTv.post.mockResolvedValue({ data: userToken ? { authToken: userToken } : {} });
const resourcesAre = (resources: { clientIdentifier: string, accessToken?: string }[]) => plexTv.get.mockResolvedValue({ data: resources });

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'plex-settings-for-'));
    process.env.STORAGE_DIR = dir;
    plexTv.get.mockReset();
    plexTv.post.mockReset();
});

afterEach(() => { rmSync(dir, { recursive: true, force: true }) });

describe('plexSettingsForUser', () => {
    it("uses the owner's server token for an item with no Spotify user", async () => {
        expect(await plexSettingsForUser()).toEqual({ id: 'machine', uri: 'http://plex.test:32400', token: 'owner-server' });
        expect(plexTv.post).not.toHaveBeenCalled();
    });

    it("uses the owner's server token for a Spotify user with no Plex Home user", async () => {
        mapTo('faye-spotify');

        expect((await plexSettingsForUser('faye-spotify')).token).toBe('owner-server');
        expect(plexTv.post).not.toHaveBeenCalled();
    });

    it("switches to the Home user with the owner's account token and uses that user's token for this server", async () => {
        mapTo('faye-spotify', 'uuid-a');
        switchesTo('faye-account');
        resourcesAre([{ clientIdentifier: 'other', accessToken: 'other-server' }, { clientIdentifier: 'machine', accessToken: 'faye-server' }]);

        expect((await plexSettingsForUser('faye-spotify')).token).toBe('faye-server');
        expect(plexTv.post).toHaveBeenCalledWith('https://plex.tv/api/v2/home/users/uuid-a/switch', undefined, { params: expect.objectContaining({ 'X-Plex-Token': 'owner-account' }) });
        expect(plexTv.get).toHaveBeenCalledWith('https://plex.tv/api/v2/resources', { params: expect.objectContaining({ 'X-Plex-Token': 'faye-account' }) });
    });

    it('asks plex.tv once an hour, not on every playlist', async () => {
        mapTo('faye-spotify', 'uuid-b');
        switchesTo('faye-account');
        resourcesAre([{ clientIdentifier: 'machine', accessToken: 'faye-server' }]);

        await plexSettingsForUser('faye-spotify');
        await plexSettingsForUser('faye-spotify');
        expect(plexTv.post).toHaveBeenCalledTimes(1);

        vi.useFakeTimers({ now: Date.now() + 61 * 60 * 1000 });
        try {
            await plexSettingsForUser('faye-spotify');
        } finally {
            vi.useRealTimers();
        }
        expect(plexTv.post).toHaveBeenCalledTimes(2);
    });

    // Falling back to the owner would put the playlist in the wrong account
    it("fails rather than use the owner's token when the Home user can't reach this server", async () => {
        mapTo('faye-spotify', 'uuid-c');
        switchesTo('faye-account');
        resourcesAre([{ clientIdentifier: 'other', accessToken: 'other-server' }]);

        await expect(plexSettingsForUser('faye-spotify')).rejects.toThrow('no access to this Plex server');
    });

    it("fails rather than use the owner's token when plex.tv does not switch", async () => {
        mapTo('faye-spotify', 'uuid-d');
        switchesTo(undefined);

        await expect(plexSettingsForUser('faye-spotify')).rejects.toThrow('did not switch');
        expect(plexTv.get).not.toHaveBeenCalled();
    });
});

describe('plexSettingsForItem', () => {
    it("uses the Home user of the Spotify user the saved item came from", async () => {
        mapTo('faye-spotify', 'uuid-e');
        write('spotify_saved_items.json', [{ id: 'p-owner', type: 'spotify-playlist' }, { id: 'p-faye', type: 'spotify-playlist', user: 'faye-spotify' }]);
        switchesTo('faye-account');
        resourcesAre([{ clientIdentifier: 'machine', accessToken: 'faye-server' }]);

        expect((await plexSettingsForItem('p-faye')).token).toBe('faye-server');
        expect((await plexSettingsForItem('p-owner')).token).toBe('owner-server');
        expect((await plexSettingsForItem('not-saved')).token).toBe('owner-server');
    });
});

describe('findPickableHomeUser', () => {
    it('offers only Home users that are not the owner and have no PIN', async () => {
        resourcesAre([
            { uuid: 'owner', title: 'Dean', admin: true, protected: false },
            { uuid: 'faye', title: 'Faye', admin: false, protected: false },
            { uuid: 'kid', title: 'Kid', admin: false, protected: true }
        ] as never);

        expect(await findPickableHomeUser('faye')).toEqual({ uuid: 'faye', title: 'Faye', admin: false, protected: false });
        expect(await findPickableHomeUser('owner')).toBeUndefined();
        expect(await findPickableHomeUser('kid')).toBeUndefined();
        expect(await findPickableHomeUser('unknown')).toBeUndefined();
    });
});
