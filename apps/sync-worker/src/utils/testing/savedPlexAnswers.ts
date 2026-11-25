import { vi } from 'vitest';

// A Plex that answers /identity as the saved server 'server' and nothing else: the connection check before a sync then asks no further
export const AxiosRequest = { get: vi.fn(async (url: string) => {
    if (new URL(url).pathname !== '/identity')
        throw new Error(`unexpected GET ${url}`);

    return { data: { MediaContainer: { machineIdentifier: 'server' } } };
}) };
