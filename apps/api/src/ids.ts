import { randomBytes, randomUUID, createHash, createHmac } from 'node:crypto';
export const uuid = (): string => randomUUID();
export const token = (bytes = 24): string => randomBytes(bytes).toString('base64url');
export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');
export const hmac = (secret: string, body: string): string => createHmac('sha256', secret).update(body).digest('hex');
export const fakeTxHash = (): `0x${string}` => ('0x' + randomBytes(32).toString('hex')) as `0x${string}`;
