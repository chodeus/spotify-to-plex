import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authenticate, getCredentials, resetState, setCredentials } from '@spotify-to-plex/tidal-music-search/session/credentials';

describe('Tidal token expiry', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
        resetState();
    });

    // Read as milliseconds, a day-long token expired after 86 seconds and every later search signed in again
    it('keeps a token for the seconds Tidal grants it', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'token', expires_in: 86_400 } });
        setCredentials('id', 'secret');

        await authenticate();

        expect(getCredentials().expiresAt).toBe(Date.now() + 86_400_000);
    });
});
