import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyMessage, isAddress, getAddress } from 'viem';
import { apiKeys, magicLinks, nonces, sessions, users, type Db } from '@sera-payroll/db';
import { forbidden, unauthorized } from '../errors.js';
import { sha256, token, uuid } from '../ids.js';

export type Role = 'operator_admin' | 'preparer' | 'approver' | 'employee';
export interface AuthUser { id: string; name: string; email: string; role: Role; clientId: string | null; operatorId: string; personId: string | null; viaApiKey?: boolean }

export const SESSION_COOKIE = 'sp_session';
const SESSION_DAYS = 14;

export async function createSession(db: Db, userId: string): Promise<string> {
  const id = token(32);
  await db.insert(sessions).values({ id, userId, expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) });
  return id;
}

export function setSessionCookie(reply: FastifyReply, id: string, secure: boolean, sameSite: 'lax' | 'strict' | 'none' = 'lax'): void {
  // A web app on another origin (GitHub Pages in front of a Fly API) needs SameSite=None, which browsers only accept with Secure.
  reply.setCookie(SESSION_COOKIE, id, { path: '/', httpOnly: true, sameSite, secure: secure || sameSite === 'none', maxAge: SESSION_DAYS * 86_400 });
}

export async function resolveUser(db: Db, req: FastifyRequest): Promise<AuthUser | null> {
  const authz = req.headers.authorization;
  if (authz?.startsWith('Bearer spk_')) {
    const key = authz.slice(7);
    const rows = await db.select().from(apiKeys).where(and(eq(apiKeys.keyHash, sha256(key)), isNull(apiKeys.revokedAt))).limit(1);
    const k = rows[0];
    if (!k) return null;
    return { id: `apikey:${k.id}`, name: `API key ${k.label}`, email: '', role: 'operator_admin', clientId: null, operatorId: k.operatorId, personId: null, viaApiKey: true };
  }
  const sid = req.cookies[SESSION_COOKIE];
  if (!sid) return null;
  const rows = await db.select({ u: users }).from(sessions).innerJoin(users, eq(sessions.userId, users.id)).where(and(eq(sessions.id, sid), gt(sessions.expiresAt, new Date()))).limit(1);
  const u = rows[0]?.u;
  if (!u) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role, clientId: u.clientId, operatorId: u.operatorId, personId: u.personId };
}

export function requireUser(req: FastifyRequest): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function requireRole(req: FastifyRequest, ...roles: Role[]): AuthUser {
  const u = requireUser(req);
  if (!roles.includes(u.role)) throw forbidden(`This needs one of: ${roles.join(', ')}.`);
  return u;
}

/** Employer routes: preparer or approver of that client, or an operator admin of its operator. */
export function requireClientAccess(req: FastifyRequest, clientId: string, clientOperatorId: string, roles: Role[] = ['preparer', 'approver', 'operator_admin']): AuthUser {
  const u = requireUser(req);
  if (!roles.includes(u.role)) throw forbidden();
  if (u.role === 'operator_admin') { if (u.operatorId !== clientOperatorId) throw forbidden('That client belongs to another operator.'); return u; }
  if (u.clientId !== clientId) throw forbidden('That client is not yours.');
  return u;
}

export async function issueMagicLink(db: Db, email: string): Promise<{ token: string; user: typeof users.$inferSelect } | null> {
  const u = (await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1))[0];
  if (!u) return null;
  const t = token(32);
  await db.insert(magicLinks).values({ token: t, userId: u.id, expiresAt: new Date(Date.now() + 15 * 60_000) });
  return { token: t, user: u };
}

export async function consumeMagicLink(db: Db, t: string): Promise<string | null> {
  const row = (await db.select().from(magicLinks).where(and(eq(magicLinks.token, t), isNull(magicLinks.usedAt), gt(magicLinks.expiresAt, new Date()))).limit(1))[0];
  if (!row) return null;
  await db.update(magicLinks).set({ usedAt: new Date() }).where(eq(magicLinks.token, t));
  return row.userId;
}

export async function issueNonce(db: Db, purpose: string, subject: string | null, payload: Record<string, unknown> = {}, ttlMs = 10 * 60_000): Promise<string> {
  const n = token(16);
  await db.insert(nonces).values({ nonce: n, purpose, subject, payload, expiresAt: new Date(Date.now() + ttlMs) });
  return n;
}

export async function consumeNonce(db: Db, nonce: string, purpose: string, subject: string | null): Promise<Record<string, unknown> | null> {
  const row = (await db.select().from(nonces).where(and(eq(nonces.nonce, nonce), eq(nonces.purpose, purpose), isNull(nonces.usedAt), gt(nonces.expiresAt, new Date()))).limit(1))[0];
  if (!row || (subject && row.subject !== subject)) return null;
  await db.update(nonces).set({ usedAt: new Date() }).where(eq(nonces.nonce, nonce));
  return row.payload;
}

/** Sign-in with Ethereum, minimal form: a fixed message carrying domain, address and nonce. */
export function siweMessage(domain: string, address: string, nonce: string, issuedAt: string): string {
  return `${domain} wants you to sign in with your Ethereum account:\n${address}\n\nSign in to payroll. This costs nothing and moves no funds.\n\nURI: https://${domain}\nVersion: 1\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
}

export function parseSiwe(message: string): { domain: string; address: string; nonce: string } | null {
  const m = message.match(/^(\S+) wants you to sign in with your Ethereum account:\n(0x[0-9a-fA-F]{40})\n[\s\S]*Nonce: (\S+)\n/);
  if (!m || !isAddress(m[2]!, { strict: false })) return null;
  return { domain: m[1]!, address: getAddress(m[2]! as `0x${string}`), nonce: m[3]! };
}

export async function verifySiwe(db: Db, message: string, signature: `0x${string}`, expectedDomain: string): Promise<typeof users.$inferSelect | null> {
  const p = parseSiwe(message);
  if (!p || p.domain !== expectedDomain) return null;
  if (!(await consumeNonce(db, p.nonce, 'siwe', null))) return null;
  if (!(await verifyMessage({ address: p.address as `0x${string}`, message, signature }))) return null;
  const u = (await db.select().from(users).where(eq(users.walletAddress, p.address as string)).limit(1))[0];
  return u ?? null;
}

export async function createApiKey(db: Db, operatorId: string, label: string): Promise<{ id: string; key: string }> {
  const key = `spk_${token(24)}`;
  const id = uuid();
  await db.insert(apiKeys).values({ id, operatorId, label, prefix: key.slice(0, 10), keyHash: sha256(key) });
  return { id, key };
}

declare module 'fastify' {
  interface FastifyRequest { user: AuthUser | null }
}
