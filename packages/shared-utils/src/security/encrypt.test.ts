import { createCipheriv } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

const KEY = '0'.repeat(64);
let encrypt: (text: string) => string;
let decrypt: (text: string) => string;

describe('encrypt', () => {
    beforeAll(async () => {
        // The key is read when constants loads, so it has to be set first
        process.env.ENCRYPTION_KEY = KEY;
        ({ encrypt } = await import('./encrypt'));
        ({ decrypt } = await import('./decrypt'));
    });

    it('gives the same text a different ciphertext each time', () => {
        const first = encrypt('refresh-token');
        const second = encrypt('refresh-token');

        expect(first).not.toBe(second);
        expect(first.split(':')[0]).not.toBe(second.split(':')[0]);
    });

    it('still decrypts what it wrote', () => {
        expect(decrypt(encrypt('refresh-token'))).toBe('refresh-token');
    });

    // Tokens already in spotify.json share one IV and must still decrypt
    it('still decrypts a token written with a fixed IV', () => {
        const iv = Buffer.alloc(16, 7);
        const cipher = createCipheriv('aes-256-cbc', Buffer.from(KEY, 'hex'), iv);
        const stored = `${iv.toString('hex')}:${cipher.update('old-token', 'utf8', 'hex')}${cipher.final('hex')}`;

        expect(decrypt(stored)).toBe('old-token');
    });
});
