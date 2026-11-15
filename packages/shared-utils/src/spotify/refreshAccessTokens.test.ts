import axios from 'axios';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { SpotifyCredentials } from '@spotify-to-plex/shared-types/spotify/SpotifyCredentials';

vi.mock('axios', () => ({ default: { post: vi.fn() } }));
vi.mock('../security/encrypt', () => ({ encrypt: (text: string) => `enc:${text}` }));
vi.mock('../security/decrypt', () => ({ decrypt: (text: string) => text.replace(/^enc:/, '') }));

const { refreshAccessTokens, REFRESH_MARGIN_MS, REFRESH_LOCK_WAIT_MS } = await import('./refreshAccessTokens');
const { waitForLock } = await import('../utils/syncLock');
const postMock = axios.post as unknown as Mock;

function credential(id: string, expiresAt: number): SpotifyCredentials {
    return {
        user: { id, name: id },
        access_token: { access_token: 'enc:old', refresh_token: 'enc:refresh', expires_in: 3600, token_type: 'Bearer' },
        expires_at: expiresAt
    };
}

describe('refreshAccessTokens', () => {
    let dir: string;
    let temp: string;
    const path = () => join(dir, 'spotify.json');
    const stored = (): SpotifyCredentials[] => JSON.parse(readFileSync(path(), 'utf8'));

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'spotify-creds-'));
        // The refresh lock lives in the temp directory: a test's own keeps it from meeting a real install's
        temp = mkdtempSync(join(tmpdir(), 'spotify-lock-'));
        vi.stubEnv('TMPDIR', temp);
        process.env.STORAGE_DIR = dir;
        process.env.SPOTIFY_API_CLIENT_ID = 'client';
        process.env.SPOTIFY_API_CLIENT_SECRET = 'secret';
        postMock.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        rmSync(dir, { recursive: true, force: true });
        rmSync(temp, { recursive: true, force: true });
        delete process.env.STORAGE_DIR;
    });

    // The web app edits spotify.json while the refresh waits on Spotify
    it('keeps changes made to spotify.json during the refresh', async () => {
        writeFileSync(path(), JSON.stringify([credential('expired', 0), credential('removed', 0), credential('fresh', Date.now() + REFRESH_MARGIN_MS + 60_000)]));
        postMock.mockImplementation(async () => {
            const during = stored().filter(item => item.user.id !== 'removed');
            during[0]!.user.label = 'Relabelled';
            writeFileSync(path(), JSON.stringify(during));

            return { data: { access_token: 'new', expires_in: 3600, token_type: 'Bearer' } };
        });

        await refreshAccessTokens();

        const after = stored();
        expect(after.map(item => item.user.id)).toEqual(['expired', 'fresh']);
        expect(after[0]?.user.label).toBe('Relabelled');
        expect(after[0]?.access_token.access_token).toBe('enc:new');
        expect(after[0]?.access_token.refresh_token).toBe('enc:refresh');
        expect(after[1]?.access_token.access_token).toBe('enc:old');
    });

    it('keeps tokens from a sign-in made during the refresh', async () => {
        writeFileSync(path(), JSON.stringify([credential('expired', 0)]));
        postMock.mockImplementation(async () => {
            const during = stored();
            during[0]!.access_token = { access_token: 'enc:signin', refresh_token: 'enc:signin-refresh', expires_in: 3600, token_type: 'Bearer' };
            writeFileSync(path(), JSON.stringify(during));

            return { data: { access_token: 'new', expires_in: 3600, token_type: 'Bearer' } };
        });

        await refreshAccessTokens();

        expect(stored()[0]?.access_token.access_token).toBe('enc:signin');
        expect(stored()[0]?.access_token.refresh_token).toBe('enc:signin-refresh');
    });

    it('leaves the file alone when no token needed refreshing', async () => {
        writeFileSync(path(), JSON.stringify([credential('fresh', Date.now() + REFRESH_MARGIN_MS + 60_000)]));

        await refreshAccessTokens();

        expect(postMock).not.toHaveBeenCalled();
        expect(stored()[0]?.access_token.access_token).toBe('enc:old');
    });

    // A token that expires within the margin would run out partway through the sync that reads it
    it('refreshes a token that expires within the margin', async () => {
        writeFileSync(path(), JSON.stringify([credential('expiring', Date.now() + 60_000), credential('fresh', Date.now() + REFRESH_MARGIN_MS + 60_000)]));
        postMock.mockResolvedValue({ data: { access_token: 'new', expires_in: 3600, token_type: 'Bearer' } });

        await refreshAccessTokens();

        expect(postMock).toHaveBeenCalledTimes(1);
        expect(stored()[0]?.access_token.access_token).toBe('enc:new');
        expect(stored()[0]?.expires_at).toBeGreaterThan(Date.now() + 3_500_000);
        expect(stored()[1]?.access_token.access_token).toBe('enc:old');
    });

    // Each playlist load calls this: calls made together must not each send the refresh token
    it('shares one refresh between calls made together', async () => {
        writeFileSync(path(), JSON.stringify([credential('expired', 0)]));
        postMock.mockResolvedValue({ data: { access_token: 'new', expires_in: 3600, token_type: 'Bearer' } });

        await Promise.all([refreshAccessTokens(), refreshAccessTokens(), refreshAccessTokens()]);

        expect(postMock).toHaveBeenCalledTimes(1);
        expect(stored()[0]?.access_token.access_token).toBe('enc:new');
    });

    // The other process (web app or scheduler) refreshed while this one waited: its token is used, not refreshed again
    it('waits for a refresh in another process and uses its token', async () => {
        writeFileSync(path(), JSON.stringify([credential('expired', 0)]));
        const release = await waitForLock('spotify-token-refresh', 0);
        expect(release).toBeDefined();

        const refreshing = refreshAccessTokens();
        await new Promise(resolve => { setTimeout(resolve, 300) });
        expect(postMock).not.toHaveBeenCalled();

        const other = credential('expired', Date.now() + 3_600_000);
        other.access_token.access_token = 'enc:other';
        writeFileSync(path(), JSON.stringify([other]));
        release?.();
        await refreshing;

        expect(postMock).not.toHaveBeenCalled();
        expect(stored()[0]?.access_token.access_token).toBe('enc:other');
    });

    // A hung holder must not stop every sync
    it('refreshes anyway when the lock is still held after the wait', async () => {
        vi.useFakeTimers();
        vi.spyOn(console, 'warn').mockImplementation(() => { /* expected */ });
        writeFileSync(path(), JSON.stringify([credential('expired', 0)]));
        postMock.mockResolvedValue({ data: { access_token: 'new', expires_in: 3600, token_type: 'Bearer' } });
        const release = await waitForLock('spotify-token-refresh', 0);

        const refreshing = refreshAccessTokens();
        await vi.advanceTimersByTimeAsync(REFRESH_LOCK_WAIT_MS + 1000);
        await refreshing;
        release?.();

        expect(postMock).toHaveBeenCalledTimes(1);
        expect(stored()[0]?.access_token.access_token).toBe('enc:new');
    });

    // Every playlist load waits on the refresh, so it must give up
    it('gives up on the token request after 15 s', async () => {
        writeFileSync(path(), JSON.stringify([credential('expired', 0)]));
        postMock.mockResolvedValue({ data: { access_token: 'new', expires_in: 3600, token_type: 'Bearer' } });

        await refreshAccessTokens();

        expect(postMock.mock.calls[0]?.[2]?.timeout).toBe(15_000);
    });
});
