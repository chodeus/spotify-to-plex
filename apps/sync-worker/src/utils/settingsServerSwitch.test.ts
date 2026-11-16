import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { updateSettings } from '@spotify-to-plex/plex-config/functions/updateSettings';
import { getCachedTrackLinks } from '@spotify-to-plex/shared-utils/cache/getCachedTrackLink';
import { setManualTrackLink } from '@spotify-to-plex/shared-utils/cache/setManualTrackLink';
import { waitForLock } from '@spotify-to-plex/shared-utils/utils/syncLock';

import { membersOf, plex, resetPlex, tag } from './testing/fakePlexLibrary';

const { plexTv, loadSpotifyData } = vi.hoisted(() => ({ plexTv: { get: vi.fn(), post: vi.fn() }, loadSpotifyData: vi.fn() }));
vi.mock('@spotify-to-plex/http-client/plexTvClient', () => ({ plexTvClient: plexTv }));
vi.mock('@spotify-to-plex/http-client/AxiosRequest', async () => {
    const { fakeAxiosRequest } = await import('./testing/fakePlexLibrary');

    return { AxiosRequest: fakeAxiosRequest };
});
vi.mock('./loadSpotifyData', () => ({ loadSpotifyData }));
const { disk } = vi.hoisted(() => ({ disk: {
    failDelete: false,
    refuseDelete: '',
    deleting: 0,
    failWrite: undefined as ((path: string) => boolean) | undefined,
    holdRead: undefined as { reached: () => void, gate: Promise<void> } | undefined
} }));
vi.mock('@spotify-to-plex/shared-utils/utils/writeJsonFileAtomic', async importOriginal => {
    const actual = await importOriginal<typeof import('@spotify-to-plex/shared-utils/utils/writeJsonFileAtomic')>();

    return { writeJsonFileAtomic: (path: string, data: unknown) => {
        if (disk.failWrite?.(path))
            throw new Error('ENOSPC: no space left on device');

        actual.writeJsonFileAtomic(path, data);
    } };
});
vi.mock('@spotify-to-plex/plex-config/utils/fileUtils', async importOriginal => {
    const actual = await importOriginal<typeof import('@spotify-to-plex/plex-config/utils/fileUtils')>();

    return {
        ...actual,
        deleteJSON: async (name: string) => {
            if (disk.failDelete || disk.refuseDelete === name)
                throw new Error('EACCES: permission denied');

            disk.deleting++;
            try {
                // A delete that goes through answers later than a refused one
                await new Promise(resolve => { setTimeout(resolve, 20) });
                await actual.deleteJSON(name);
            } finally {
                disk.deleting--;
            }
        },
        // Holds one read of the settings after the file is read, as a slow disk would
        readJSON: async <T>(name: string) => {
            const value = await actual.readJSON<T>(name);
            const hold = disk.holdRead;
            if (name === 'plex.json' && hold) {
                disk.holdRead = undefined;
                hold.reached();
                await hold.gate;
            }

            return value;
        }
    };
});
// Every track already matched in the cache, so the sync searches nothing
vi.mock('./getCachedPlexTracks', () => ({ getCachedPlexTracks: async () => ({
    result: [1, 2, 3].map(n => ({ id: `t${n}`, title: `t${n}`, artist: 'A', album: 'B', result: [{ id: `/library/metadata/${n}` }] })),
    add: vi.fn(), markChecked: vi.fn(), recheck: [], standIns: new Map<string, string>()
}) }));
vi.mock('./findMissingTidalTracks', () => ({ findMissingTidalTracks: async () => [] }));
vi.mock('@/helpers/plex/getPlexServers', async () => import('../../../web/src/helpers/plex/getPlexServers'));
vi.mock('@/helpers/errors/generateError', async () => import('../../../web/src/helpers/errors/generateError'));

let dir: string;
const write = (name: string, data: unknown) => { writeFileSync(join(dir, name), JSON.stringify(data)) };
const read = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
const saved = (plexTarget: string) => write('spotify_saved_items.json', [{ type: 'spotify-playlist', id: 'p1', title: 'Mix', uri: 'spotify:playlist:p1', image: '', sync: true, sync_interval: '0', plex_target: plexTarget }]);
const errorOf = (id: string) => read('sync_log.json').playlists.find((log: { id: string }) => log.id === id)?.error;
const collectionsNamed = (title: string) => [...plex.collections].filter(([, c]) => c.title === title).map(([ratingKey]) => ratingKey);
const newServer = { id: 'other-machine', uri: 'http://other.test:32400', serverToken: 'other-server' };
const slskdFile = { username: 'u', filename: 'Song.flac', size: 3 };
const links = [
    { spotify_id: 't1', plex_id: ['/library/metadata/1'], manual: true, tidal_id: ['91'] },
    { spotify_id: 't2', plex_id: ['/library/metadata/2'], plex_matched_by: 'isrc', plex_checked_at: 1_700_000_000_000, slskd_files: [slskdFile] },
    { spotify_id: 'album-b', plex_id: ['/library/metadata/50'] }
];
const unmatched = [{ spotify_id: 't1', tidal_id: ['91'] }, { spotify_id: 't2', slskd_files: [slskdFile] }, { spotify_id: 'album-b' }];
const oldServer = { id: 'machine', uri: 'http://plex.test:32400', serverToken: 'owner-server' };

function holdNextSettingsRead() {
    let reached = (): void => undefined;
    let release = (): void => undefined;
    const read = new Promise<void>(resolve => { reached = resolve });
    const gate = new Promise<void>(resolve => { release = resolve });
    disk.holdRead = { reached, gate };

    return { read, release };
}

// Runs `other` while `held` waits on its settings read; `other` gets 300 ms, as a save waiting for the lock never ends
async function whileReadHeld(held: () => Promise<unknown>, other: () => Promise<unknown>) {
    const hold = holdNextSettingsRead();
    const first = held();
    await hold.read;
    const second = other();
    await Promise.race([second, new Promise(resolve => { setTimeout(resolve, 300) })]);
    hold.release();

    return Promise.all([first, second]);
}

async function sync() {
    const { syncPlaylists } = await import('../jobs/playlists');
    await syncPlaylists(true);
}

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'settings-switch-'));
    process.env.STORAGE_DIR = dir;
    resetPlex();
    disk.failDelete = false;
    disk.refuseDelete = '';
    disk.deleting = 0;
    disk.holdRead = undefined;
    disk.failWrite = undefined;
    write('plex.json', { id: 'machine', uri: 'http://plex.test:32400', token: 'owner-account', serverToken: 'owner-server' });
    saved('collection');
    plexTv.get.mockResolvedValue({ data: [{ product: 'Plex Media Server', name: 'New', clientIdentifier: 'other-machine', accessToken: 'other-server', connections: [{ local: true, uri: 'http://other.test:32400' }] }] });
    loadSpotifyData.mockReset().mockImplementation(async () => ({ title: 'Mix', image: '', tracks: [1, 2, 3].map(n => ({ id: `t${n}`, title: `t${n}`, album: 'B', album_id: 'b', artists: ['A'] })) }));
    vi.spyOn(console, 'log').mockImplementation(() => { /* expected */ });
    vi.spyOn(console, 'error').mockImplementation(() => { /* expected */ });
});
afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
});

describe('POST /api/settings choosing another Plex server', () => {
    async function post(body: unknown) {
        const { default: handler } = await import('../../../web/pages/api/settings');
        let status = 200; let json: unknown;
        const res = { status(n: number) { status = n;

            return res }, json(b: unknown) { json = b;

            return res }, setHeader() { return res }, end() { return res } };
        await handler({ method: 'POST', url: '/api/settings', headers: {}, query: {}, body } as never, res as never);

        return { status, json };
    }

    it.each(['playlists', 'albums'])('refuses while the %s sync runs, and changes nothing', async lock => {
        write('collections.json', { data: [{ id: 'p1', plex: '900' }] });
        write('track_links.json', links);
        const release = await waitForLock(lock, 0);
        try {
            const { status, json } = await post({ id: 'other-machine', uri: 'http://other.test:32400' });

            expect({ status, json }).toEqual({ status: 409, json: { error: 'A playlist or album sync is running: choose the new Plex server once it finishes' } });
        } finally {
            release?.();
        }

        expect(read('plex.json').id).toBe('machine');
        expect(read('collections.json').data).toEqual([{ id: 'p1', plex: '900' }]);
        expect(read('track_links.json')).toEqual(links);
        expect(existsSync(join(dir, 'plex_matches_by_server.json'))).toBe(false);
        // The refusal must not keep the other lock: the next sync would never start
        const free = await Promise.all(['playlists', 'albums'].map(name => waitForLock(name, 0)));
        free.forEach(release => release?.());
        expect(free.map(Boolean)).toEqual([true, true]);
    });

    it('lets go of the playlist lock when the album lock cannot be read, and changes nothing', async () => {
        write('track_links.json', links);
        // Mirrors lockPath in syncLock.ts
        const storage = createHash('sha256')
            .update(resolve(dir))
            .digest('hex')
            .slice(0, 12);
        const albumsLock = join(tmpdir(), 'spotify-to-plex-locks', storage, 'albums.lock');
        mkdirSync(dirname(albumsLock), { recursive: true });
        writeFileSync(albumsLock, '{}', { mode: 0o000 });
        try {
            const { status, json } = await post({ id: 'other-machine', uri: 'http://other.test:32400' });

            expect({ status, json }).toEqual({ status: 500, json: { error: 'Failed to update settings' } });
        } finally {
            rmSync(albumsLock, { force: true });
        }

        expect(read('plex.json').id).toBe('machine');
        expect(read('track_links.json')).toEqual(links);
        const playlists = await waitForLock('playlists', 0);
        playlists?.();
        expect(playlists).toBeDefined();
    });

    it("forgets the old server's Plex matches, hand-picks included, and keeps the Tidal and slskd ones", async () => {
        write('track_links.json', links);

        const { status } = await post({ id: 'other-machine', uri: 'http://other.test:32400' });

        expect(status).toBe(200);
        expect(read('track_links.json')).toEqual(unmatched);
        const tracks = ['t1', 't2'].map(id => ({ id, title: id, artists: ['A'] }));
        expect(getCachedTrackLinks(tracks, 'plex').found).toEqual([]);
        expect(getCachedTrackLinks(tracks, 'tidal').found.map(link => link.spotify_id)).toEqual(['t1']);
    });

    it("brings back each server's own matches, hand-picks included, when it is chosen again", async () => {
        write('track_links.json', links);

        await updateSettings(newServer);
        setManualTrackLink('t1', '/library/metadata/77');
        await updateSettings(oldServer);

        expect(read('track_links.json')).toEqual(links);

        await updateSettings(newServer);

        expect(read('track_links.json')).toEqual([{ spotify_id: 't1', tidal_id: ['91'], plex_id: ['/library/metadata/77'], manual: true }, ...unmatched.slice(1)]);
    });

    it("puts the old server's matches back as soon as a switch fails part-way, so a hand-pick made next is kept with them", async () => {
        write('track_links.json', links);
        disk.failDelete = true;

        const failed = await post({ id: 'other-machine', uri: 'http://other.test:32400' });
        disk.failDelete = false;

        expect(failed.status).toBe(500);
        expect(read('plex.json').id).toBe('machine');
        expect(read('track_links.json')).toEqual(links);

        setManualTrackLink('t2', '/library/metadata/88');
        const picked = read('track_links.json');
        await updateSettings(newServer);
        await updateSettings(oldServer);

        expect(read('track_links.json')).toEqual(picked);
    });

    it('stops at the first delete that fails, with no other file change still running when it answers', async () => {
        write('collections.json', { data: [{ id: 'p1', plex: '900' }] });
        disk.refuseDelete = 'playlists.json';

        const { status } = await post({ id: 'other-machine', uri: 'http://other.test:32400' });

        expect(status).toBe(500);
        expect(disk.deleting).toBe(0);
        expect(read('collections.json').data).toEqual([{ id: 'p1', plex: '900' }]);
    });

    it('keeps each server its own matches when two switches to the same server overlap', async () => {
        write('track_links.json', links);

        await whileReadHeld(() => updateSettings(newServer), () => updateSettings(newServer));

        expect(read('plex.json')).toMatchObject(newServer);
        await updateSettings(oldServer);
        expect(read('track_links.json')).toEqual(links);
    });

    it('keeps the new server when another save of the same server overlaps the switch', async () => {
        write('track_links.json', links);

        await whileReadHeld(() => updateSettings({ token: 'renewed' }), () => updateSettings(newServer));

        expect(read('plex.json')).toMatchObject({ ...newServer, token: 'renewed' });
        expect(read('track_links.json')).toEqual(unmatched);
    });

    it("keeps the new server's matches when they could not be put back, and brings them back on its next return", async () => {
        write('track_links.json', links);
        await updateSettings(newServer);
        setManualTrackLink('t1', '/library/metadata/77');
        const [pickedOnNew] = read('track_links.json');
        await updateSettings(oldServer);

        let writes = 0;
        disk.failWrite = path => path.endsWith('track_links.json') && ++writes === 2;
        await updateSettings(newServer);
        disk.failWrite = undefined;

        expect(read('plex.json')).toMatchObject(newServer);
        expect(read('track_links.json')).toEqual(unmatched);

        setManualTrackLink('t2', '/library/metadata/88');
        const [, pickedSince] = read('track_links.json');
        await updateSettings(oldServer);
        await updateSettings(newServer);

        expect(read('track_links.json')).toEqual([pickedOnNew, pickedSince, unmatched[2]]);
    });

    it('leaves out a match the sync dropped after the matches were put back', async () => {
        write('track_links.json', links);
        await updateSettings(newServer);
        await updateSettings(oldServer);
        // Plex no longer has t2's track, so the sync emptied its link
        write('track_links.json', [links[0], { ...links[1], plex_id: [] }, links[2]]);

        await updateSettings(newServer);
        await updateSettings(oldServer);

        expect(read('track_links.json')).toEqual([links[0], unmatched[1], links[2]]);
    });

    it('keeps the switch when the matches kept for the new server cannot be put back', async () => {
        write('track_links.json', links);
        write('plex_matches_by_server.json', [{ server: 'other-machine', matches: 5 }]);

        const { status } = await post({ id: 'other-machine', uri: 'http://other.test:32400' });

        expect(status).toBe(200);
        expect(read('plex.json')).toMatchObject(newServer);
        expect(read('track_links.json')).toEqual(unmatched);
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('The Plex matches kept for this server could not be put back'));
    });

    const kept = ['track_links.json', 'plex_matches_by_server.json'];
    it.each(kept)('stops before changing anything when %s cannot be read', async torn => {
        write('track_links.json', links);
        write('plex_matches_by_server.json', []);
        writeFileSync(join(dir, torn), '[{"spotify_id": "t1",');
        write('playlists.json', { data: [{ id: 'p1', plex: '700' }] });
        write('collections.json', { data: [{ id: 'p1', plex: '900' }] });
        const before = kept.map(file => readFileSync(join(dir, file), 'utf8'));

        const { status, json } = await post({ id: 'other-machine', uri: 'http://other.test:32400' });

        expect({ status, json }).toEqual({ status: 500, json: { error: 'Failed to update settings' } });
        expect(read('plex.json').id).toBe('machine');
        expect(read('playlists.json').data).toEqual([{ id: 'p1', plex: '700' }]);
        expect(read('collections.json').data).toEqual([{ id: 'p1', plex: '900' }]);
        expect(kept.map(file => readFileSync(join(dir, file), 'utf8'))).toEqual(before);
    });

    it("switches when no playlist sync runs, and drops the old server's records", async () => {
        write('collections.json', { data: [{ id: 'p1', plex: '900' }] });

        const { status, json } = await post({ id: 'other-machine', uri: 'http://other.test:32400' });

        expect({ status, json }).toEqual({ status: 200, json: { loggedin: true, uri: 'http://other.test:32400', id: 'other-machine' } });
        expect(read('plex.json')).toMatchObject(newServer);
        expect(existsSync(join(dir, 'collections.json'))).toBe(false);
    });
});

describe('playlist sync across a Plex server switch', () => {
    it("leaves a new server's playlist and collection alone when they carry the keys saved for the old server", async () => {
        saved('both');
        write('playlists.json', { data: [{ id: 'p1', plex: '700' }] });
        write('collections.json', { data: [{ id: 'p1', plex: '800' }] });
        plex.playlists.set('700', ['/library/metadata/7']);
        plex.collections.set('800', { title: 'Road Trip', section: 6 });
        tag('7', 'Road Trip');

        await updateSettings(newServer);
        await sync();

        expect(plex.playlists.get('700')).toEqual(['/library/metadata/7']);
        expect([...plex.playlists.values()]).toContainEqual(['/library/metadata/1', '/library/metadata/2', '/library/metadata/3']);
        expect(plex.collections.get('800')?.title).toBe('Road Trip');
        expect(membersOf('800')).toEqual(['7']);
        expect(membersOf(collectionsNamed('Mix')[0] ?? '')).toEqual(['1', '2', '3']);
    });

    it('refuses a server switch while a playlist sync runs, and keeps what that sync saved', async () => {
        const load = loadSpotifyData.getMockImplementation();
        let refused: unknown;
        loadSpotifyData.mockImplementationOnce(async (...args: unknown[]) => {
            refused = await updateSettings(newServer).then(() => 'switched', (error: unknown) => error instanceof Error ? error.message : error);

            return load?.(...args);
        });

        await sync();

        expect(refused).toBe('A playlist or album sync is running: choose the new Plex server once it finishes');
        expect(read('plex.json').id).toBe('machine');
        expect(errorOf('p1')).toBeUndefined();
        expect(read('collections.json').data).toEqual([{ id: 'p1', plex: '900' }]);
    });

    it('keeps its collection and every track match when the same server is chosen at another address', async () => {
        write('track_links.json', links);
        await sync();

        await updateSettings({ id: 'machine', uri: 'http://other.test:32400', serverToken: 'owner-server' });
        await sync();

        expect(errorOf('p1')).toBeUndefined();
        expect([...plex.collections.keys()]).toEqual(['900']);
        expect(membersOf('900')).toEqual(['1', '2', '3']);
        expect(read('track_links.json')).toEqual(links);
    });
});
