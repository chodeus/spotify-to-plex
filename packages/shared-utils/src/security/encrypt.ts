import { createCipheriv, randomBytes } from 'node:crypto';
import { algorithm, key } from './constants';

export function encrypt(text: string) {
    // Never reuse an IV: equal tokens would encrypt alike. decrypt reads it from in front of the ciphertext
    const iv = randomBytes(16);
    const cipher = createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
}
