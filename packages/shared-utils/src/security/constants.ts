/* eslint-disable custom/no-export-only-files */
export const algorithm = 'aes-256-cbc';
export const key = Buffer.from(process.env.ENCRYPTION_KEY || "", 'hex');
