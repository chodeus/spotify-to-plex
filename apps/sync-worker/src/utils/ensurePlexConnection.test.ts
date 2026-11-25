import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { updateSettings } from '@spotify-to-plex/plex-config/functions/updateSettings';

// plex-helpers has no test runner; the worker's vitest aliases reach its source
const { plexTv, answering, hold } = vi.hoisted(() => ({
    plexTv: { get: vi.fn() },
    // origin -> the machine that answers there, or its answers in turn; a missing origin does not answer
    answering: new Map<string, string | (string | undefined)[]>(),
    // An /identity request to this origin waits for the gate
    hold: { origin: '', reached: () => { /* set by a test */ }, gate: Promise.resolve() }
}));
vi.mock('@spotify-to-plex/http-client/plexTvClient', () => ({ plexTvClient: plexTv }));
vi.mock('@spotify-to-plex/http-client/AxiosRequest', () => ({ AxiosRequest: { get: vi.fn(async (url: string) => {
    const { origin } = new URL(url);
    if (origin === hold.origin) {
        hold.reached();
        await hold.gate;
    }

    const entry = answering.get(origin);
    const machine = Array.isArray(entry) ? entry.shift() : entry;
    if (!machine)
        throw Object.assign(new Error('timeout of 10000ms exceeded'), { code: 'ECONNABORTED' });

    return { data: { MediaContainer: { machineIdentifier: machine } } };
}) } }));

const { ensurePlexConnection } = await import('@spotify-to-plex/plex-helpers/utils/ensurePlexConnection');
const { AxiosRequest } = await import('@spotify-to-plex/http-client/AxiosRequest');

const OLD_WAN = 'http://203.0.113.7:32400';
const NEW_WAN = 'http://198.51.100.2:32400';
const LAN = 'http://192.168.1.10:32400';
const RELAY = 'https://relay.plex.direct:8443';
const SAVED = { id: 'machine', uri: OLD_WAN, token: 'account-token', serverToken: 'server-token' };

const resources = (connections: { local: boolean, relay?: boolean, uri: string }[], extra: object = {}) => ({ data: [
    { product: 'Plex Media Server', name: 'Other', clientIdentifier: 'other-machine', accessToken: 'other-token', connections: [{ local: true, uri: 'http://192.168.1.99:32400' }] },
    { product: 'Plex Media Server', name: 'Home', clientIdentifier: 'machine', accessToken: 'fresh-server-token', connections, ...extra }
] });

let dir: string;
let errors: ReturnType<typeof vi.spyOn>;
const saved = () => JSON.parse(readFileSync(join(dir, 'plex.json'), 'utf8'));

describe('ensurePlexConnection', () => {
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'ensure-plex-'));
        process.env.STORAGE_DIR = dir;
        writeFileSync(join(dir, 'plex.json'), JSON.stringify(SAVED));
        plexTv.get.mockReset();
        vi.mocked(AxiosRequest.get).mockClear();
        answering.clear();
        hold.origin = '';
        vi.spyOn(console, 'log').mockImplementation(() => { /* expected */ });
        errors = vi.spyOn(console, 'error').mockImplementation(() => { /* expected */ });
    });
    afterEach(() => {
        vi.restoreAllMocks();
        rmSync(dir, { recursive: true, force: true });
    });

    it('leaves a connection that answers alone, without asking plex.tv', async () => {
        answering.set(OLD_WAN, 'machine');

        await ensurePlexConnection();

        expect(plexTv.get).not.toHaveBeenCalled();
        expect(saved()).toEqual(SAVED);
    });

    it('switches to the local connection when the saved public IP stops answering', async () => {
        answering.set(LAN, 'machine');
        answering.set(NEW_WAN, 'machine');
        plexTv.get.mockResolvedValue(resources([
            { local: false, uri: NEW_WAN },
            { local: true, uri: LAN }
        ]));

        await ensurePlexConnection();

        expect(saved()).toEqual({ ...SAVED, uri: LAN, serverToken: 'fresh-server-token' });
        expect(plexTv.get.mock.calls[0]?.[1]?.headers).toEqual({ 'X-Plex-Token': 'account-token' });
    });

    it('sends no Plex token to any address it checks, and asks the saved one twice', async () => {
        answering.set(LAN, 'someone-else');
        answering.set(NEW_WAN, 'machine');
        plexTv.get.mockResolvedValue(resources([{ local: true, uri: LAN }, { local: false, uri: NEW_WAN }]));

        await ensurePlexConnection();

        expect(vi.mocked(AxiosRequest.get).mock.calls.map(([url, token]) => [url, token])).toEqual([
            [`${OLD_WAN}/identity`, ''],
            [`${OLD_WAN}/identity`, ''],
            [`${LAN}/identity`, ''],
            [`${NEW_WAN}/identity`, '']
        ]);
    });

    it('takes the new public IP when no local connection answers, not a relay', async () => {
        answering.set(NEW_WAN, 'machine');
        answering.set(RELAY, 'machine');
        plexTv.get.mockResolvedValue(resources([
            { local: false, relay: true, uri: RELAY },
            { local: true, uri: LAN },
            { local: false, uri: NEW_WAN }
        ]));

        await ensurePlexConnection();

        expect(saved()).toEqual({ ...SAVED, uri: NEW_WAN, serverToken: 'fresh-server-token' });
    });

    it('keeps the saved connection when only a relay answers', async () => {
        answering.set(RELAY, 'machine');
        plexTv.get.mockResolvedValue(resources([{ local: false, relay: true, uri: RELAY }, { local: true, uri: LAN }]));

        await ensurePlexConnection();

        expect(saved()).toEqual(SAVED);
        expect(errors).toHaveBeenCalledWith(`Plex did not answer at ${OLD_WAN}, nor at any other direct connection plex.tv lists for this server`);
    });

    it('keeps the saved connection when it answers the second time', async () => {
        answering.set(OLD_WAN, [undefined, 'machine']);
        answering.set(LAN, 'machine');
        plexTv.get.mockResolvedValue(resources([{ local: true, uri: LAN }]));

        await ensurePlexConnection();

        expect(saved()).toEqual(SAVED);
    });

    it('does not take a connection where another server answers', async () => {
        answering.set(LAN, 'someone-else');
        plexTv.get.mockResolvedValue(resources([{ local: true, uri: LAN }]));

        await ensurePlexConnection();

        expect(saved()).toEqual(SAVED);
    });

    it('keeps https on a server that requires it', async () => {
        answering.set('https://192.168.1.10:32400', 'machine');
        plexTv.get.mockResolvedValue(resources([{ local: true, uri: LAN }], { httpsRequired: true }));

        await ensurePlexConnection();

        expect(saved()).toEqual({ ...SAVED, uri: 'https://192.168.1.10:32400', serverToken: 'fresh-server-token' });
    });

    it('keeps another server chosen while it was checking', async () => {
        answering.set(LAN, 'machine');
        plexTv.get.mockResolvedValue(resources([{ local: true, uri: LAN }]));
        const reached = new Promise<void>(resolve => {
            hold.reached = resolve;
        });
        let open = () => { /* set below */ };
        hold.gate = new Promise<void>(resolve => {
            open = resolve;
        });
        hold.origin = LAN;

        const check = ensurePlexConnection();
        await reached;
        await updateSettings({ id: 'machine-b', uri: 'http://10.0.0.9:32400', serverToken: 'b-token' });
        open();

        await expect(check).resolves.toBeUndefined();
        expect(saved()).toEqual({ ...SAVED, id: 'machine-b', uri: 'http://10.0.0.9:32400', serverToken: 'b-token' });
        expect(errors).toHaveBeenCalledWith(`Plex answers at ${LAN}, but the connection could not be saved: Another Plex server or connection was chosen meanwhile, and it is kept`);
    });

    it('says so when plex.tv does not list the saved server for this account', async () => {
        plexTv.get.mockResolvedValue({ data: resources([]).data.slice(0, 1) });

        await ensurePlexConnection();

        expect(saved()).toEqual(SAVED);
        expect(errors).toHaveBeenCalledWith(`Plex did not answer at ${OLD_WAN}, and plex.tv does not list this server for the signed-in Plex account`);
    });

    it('does not throw when plex.tv cannot be reached', async () => {
        plexTv.get.mockRejectedValue(new Error('getaddrinfo ENOTFOUND plex.tv'));

        await expect(ensurePlexConnection()).resolves.toBeUndefined();

        expect(saved()).toEqual(SAVED);
        expect(errors).toHaveBeenCalledWith(expect.stringContaining(`Plex did not answer at ${OLD_WAN}, and plex.tv could not list its other connections`));
    });

    it('does nothing before a server is chosen', async () => {
        writeFileSync(join(dir, 'plex.json'), JSON.stringify({ id: '', uri: '', token: 'account-token' }));

        await ensurePlexConnection();

        expect(AxiosRequest.get).not.toHaveBeenCalled();
        expect(plexTv.get).not.toHaveBeenCalled();
    });
});
