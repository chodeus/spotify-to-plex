import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getPlexServers } from '@spotify-to-plex/plex-helpers/utils/getPlexServers';

const { plexTv } = vi.hoisted(() => ({ plexTv: { get: vi.fn() } }));
vi.mock('@spotify-to-plex/http-client/plexTvClient', () => ({ plexTvClient: plexTv }));

const server = (connections: { local: boolean, relay?: boolean, uri: string }[], httpsRequired = false) => ({
    product: 'Plex Media Server', name: 'Home', clientIdentifier: 'machine', accessToken: 'server-token', httpsRequired, connections
});

describe('getPlexServers', () => {
    beforeEach(() => {
        plexTv.get.mockReset();
    });

    it('lists the local connections before the remote ones', async () => {
        plexTv.get.mockResolvedValue({ data: [server([
            { local: false, uri: 'http://203.0.113.7:32400' },
            { local: true, uri: 'http://192.168.1.10:32400' },
            { local: false, relay: true, uri: 'http://198.51.100.2:32400' },
            { local: true, uri: 'http://10.0.0.5:32400' }
        ])] });

        const [result] = await getPlexServers('account-token');

        expect(result?.connections).toEqual([
            { local: true, relay: false, uri: 'http://192.168.1.10:32400' },
            { local: true, relay: false, uri: 'http://10.0.0.5:32400' },
            { local: false, relay: false, uri: 'http://203.0.113.7:32400' },
            { local: false, relay: true, uri: 'http://198.51.100.2:32400' }
        ]);
    });

    it('sends the account token to plex.tv in a header, not in the URL', async () => {
        plexTv.get.mockResolvedValue({ data: [] });

        await getPlexServers('account-token');

        expect(plexTv.get.mock.calls[0]?.[1]?.headers).toEqual({ 'X-Plex-Token': 'account-token' });
        expect(plexTv.get.mock.calls[0]?.[1]?.params).not.toHaveProperty('X-Plex-Token');
    });

    it('switches every connection to https on a server that requires it', async () => {
        plexTv.get.mockResolvedValue({ data: [server([
            { local: false, uri: 'http://203.0.113.7:32400' },
            { local: true, uri: 'http://192.168.1.10:32400' }
        ], true)] });

        const [result] = await getPlexServers('account-token');

        expect(result?.connections.map(item => item.uri)).toEqual(['https://192.168.1.10:32400', 'https://203.0.113.7:32400']);
    });

    it('leaves out resources that are not a Plex Media Server', async () => {
        plexTv.get.mockResolvedValue({ data: [
            { ...server([{ local: true, uri: 'http://192.168.1.20:32500' }]), product: 'Plex for Windows' },
            server([{ local: true, uri: 'http://192.168.1.10:32400' }])
        ] });

        const result = await getPlexServers('account-token');

        expect(result.map(item => item.id)).toEqual(['machine']);
    });
});
