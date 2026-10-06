import axios from 'axios';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { SpotifyCredentials } from '@spotify-to-plex/shared-types/spotify/SpotifyCredentials';

vi.mock('axios', () => ({ default: { post: vi.fn() } }));
vi.mock('../security/encrypt', () => ({ encrypt: (text: string) => `enc:${text}` }));
vi.mock('../security/decrypt', () => ({ decrypt: (text: string) => text.replace(/^enc:/, '') }));

const { refreshAccessTokens } = await import('./refreshAccessTokens');
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
    const path = () => join(dir, 'spotify.json');
    const stored = (): SpotifyCredentials[] => JSON.parse(readFileSync(path(), 'utf8'));

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'spotify-creds-'));
        process.env.STORAGE_DIR = dir;
        process.env.SPOTIFY_API_CLIENT_ID = 'client';
        process.env.SPOTIFY_API_CLIENT_SECRET = 'secret';
        postMock.mockReset();
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
        delete process.env.STORAGE_DIR;
    });

    // The web app edits spotify.json while the refresh waits on Spotify
    it('keeps changes made to spotify.json during the refresh', async () => {
        writeFileSync(path(), JSON.stringify([credential('expired', 0), credential('removed', 0), credential('fresh', Date.now() + 60_000)]));
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

        expect(stored()[0]?.access_token.refresh_token).toBe('enc:signin-refresh');
    });

    it('leaves the file alone when no token needed refreshing', async () => {
        writeFileSync(path(), JSON.stringify([credential('fresh', Date.now() + 60_000)]));

        await refreshAccessTokens();

        expect(postMock).not.toHaveBeenCalled();
        expect(stored()[0]?.access_token.access_token).toBe('enc:old');
    });
});
