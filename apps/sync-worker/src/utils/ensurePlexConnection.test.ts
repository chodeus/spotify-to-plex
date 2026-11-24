import { beforeEach, describe, expect, it, vi } from 'vitest';

// plex-helpers has no test runner; the worker's vitest aliases reach its source
const { plexTv, settings, updateSettings, answering } = vi.hoisted(() => ({
    plexTv: { get: vi.fn() },
    settings: { current: {} },
    updateSettings: vi.fn(),
    // uri -> the machine that answers there; a uri missing here does not answer
    answering: new Map<string, string>()
}));
vi.mock('@spotify-to-plex/http-client/plexTvClient', () => ({ plexTvClient: plexTv }));
vi.mock('@spotify-to-plex/plex-config/functions/getSettings', () => ({ getSettings: async () => settings.current }));
vi.mock('@spotify-to-plex/plex-config/functions/updateSettings', () => ({ updateSettings }));
vi.mock('@spotify-to-plex/http-client/AxiosRequest', () => ({ AxiosRequest: { get: vi.fn(async (url: string) => {
    const machine = answering.get(new URL(url).origin);
    if (!machine)
        throw Object.assign(new Error('timeout of 10000ms exceeded'), { code: 'ECONNABORTED' });

    return { data: { MediaContainer: { machineIdentifier: machine } } };
}) } }));

const { ensurePlexConnection } = await import('@spotify-to-plex/plex-helpers/utils/ensurePlexConnection');
const { AxiosRequest } = await import('@spotify-to-plex/http-client/AxiosRequest');

const OLD_WAN = 'http://203.0.113.7:32400';
const NEW_WAN = 'http://198.51.100.2:32400';
const LAN = 'http://192.168.1.10:32400';

const resources = (connections: { local: boolean, relay?: boolean, uri: string }[], extra: object = {}) => ({ data: [
    { clientIdentifier: 'other-machine', accessToken: 'other-token', connections: [{ local: true, uri: 'http://192.168.1.99:32400' }] },
    { clientIdentifier: 'machine', accessToken: 'fresh-server-token', connections, ...extra }
] });

describe('ensurePlexConnection', () => {
    beforeEach(() => {
        plexTv.get.mockReset();
        updateSettings.mockReset();
        vi.mocked(AxiosRequest.get).mockClear();
        answering.clear();
        settings.current = { id: 'machine', uri: OLD_WAN, token: 'account-token', serverToken: 'server-token' };
        vi.spyOn(console, 'log').mockImplementation(() => { /* expected */ });
        vi.spyOn(console, 'error').mockImplementation(() => { /* expected */ });
    });

    it('leaves a connection that answers alone, without asking plex.tv', async () => {
        answering.set(OLD_WAN, 'machine');

        await ensurePlexConnection();

        expect(plexTv.get).not.toHaveBeenCalled();
        expect(updateSettings).not.toHaveBeenCalled();
        expect(vi.mocked(AxiosRequest.get).mock.calls[0]?.[1]).toBe('server-token');
    });

    it('switches to the local connection when the saved public IP stops answering', async () => {
        answering.set(LAN, 'machine');
        answering.set(NEW_WAN, 'machine');
        plexTv.get.mockResolvedValue(resources([
            { local: false, uri: NEW_WAN },
            { local: true, uri: LAN }
        ]));

        await ensurePlexConnection();

        expect(updateSettings).toHaveBeenCalledExactlyOnceWith({ uri: LAN, serverToken: 'fresh-server-token' });
        // Asked with the account token, in a header
        expect(plexTv.get.mock.calls[0]?.[1]?.headers).toEqual({ 'X-Plex-Token': 'account-token' });
    });

    it('takes the new public IP when no local connection answers, and a relay only last', async () => {
        answering.set(NEW_WAN, 'machine');
        answering.set('https://relay.plex.direct:8443', 'machine');
        plexTv.get.mockResolvedValue(resources([
            { local: false, relay: true, uri: 'https://relay.plex.direct:8443' },
            { local: true, uri: LAN },
            { local: false, uri: NEW_WAN }
        ]));

        await ensurePlexConnection();

        expect(updateSettings).toHaveBeenCalledExactlyOnceWith({ uri: NEW_WAN, serverToken: 'fresh-server-token' });
    });

    it('does not take a connection where another server answers', async () => {
        answering.set(LAN, 'someone-else');
        plexTv.get.mockResolvedValue(resources([{ local: true, uri: LAN }]));

        await ensurePlexConnection();

        expect(updateSettings).not.toHaveBeenCalled();
    });

    it('keeps https on a server that requires it', async () => {
        answering.set('https://192.168.1.10:32400', 'machine');
        plexTv.get.mockResolvedValue(resources([{ local: true, uri: LAN }], { httpsRequired: true }));

        await ensurePlexConnection();

        expect(updateSettings).toHaveBeenCalledExactlyOnceWith({ uri: 'https://192.168.1.10:32400', serverToken: 'fresh-server-token' });
    });

    it('keeps the saved connection when nothing else answers', async () => {
        plexTv.get.mockResolvedValue(resources([{ local: true, uri: LAN }, { local: false, uri: NEW_WAN }]));

        await expect(ensurePlexConnection()).resolves.toBeUndefined();

        expect(updateSettings).not.toHaveBeenCalled();
    });

    it('does not throw when plex.tv cannot be reached', async () => {
        plexTv.get.mockRejectedValue(new Error('getaddrinfo ENOTFOUND plex.tv'));

        await expect(ensurePlexConnection()).resolves.toBeUndefined();

        expect(updateSettings).not.toHaveBeenCalled();
    });

    it('does not throw when the new connection cannot be saved', async () => {
        answering.set(LAN, 'machine');
        plexTv.get.mockResolvedValue(resources([{ local: true, uri: LAN }]));
        updateSettings.mockRejectedValue(new Error('Another settings save is still running'));

        await expect(ensurePlexConnection()).resolves.toBeUndefined();
    });

    it('does nothing before a server is chosen', async () => {
        settings.current = { id: '', uri: '', token: 'account-token' };

        await ensurePlexConnection();

        expect(AxiosRequest.get).not.toHaveBeenCalled();
        expect(plexTv.get).not.toHaveBeenCalled();
    });
});
