import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getPlexServers } from '../../../web/src/helpers/plex/getPlexServers';

const { plexTv } = vi.hoisted(() => ({ plexTv: { get: vi.fn() } }));
vi.mock('@spotify-to-plex/http-client/plexTvClient', () => ({ plexTvClient: plexTv }));

const server = (connections: { local: boolean, uri: string }[], httpsRequired = false) => ({
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
            { local: false, uri: 'http://198.51.100.2:32400' },
            { local: true, uri: 'http://10.0.0.5:32400' }
        ])] });

        const [result] = await getPlexServers('account-token');

        expect(result?.connections).toEqual([
            { local: true, uri: 'http://192.168.1.10:32400' },
            { local: true, uri: 'http://10.0.0.5:32400' },
            { local: false, uri: 'http://203.0.113.7:32400' },
            { local: false, uri: 'http://198.51.100.2:32400' }
        ]);
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
