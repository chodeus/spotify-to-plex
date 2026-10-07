import { createCipheriv, randomBytes } from 'node:crypto';
import { algorithm, key } from './constants';

export function encrypt(text: string) {
    // A fresh IV per call: one per process gave equal tokens equal ciphertext. It travels in front, so decrypt is unchanged
    const iv = randomBytes(16);
    const cipher = createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
}
