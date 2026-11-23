import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/ApiError.js';

const BCRYPT_ROUNDS = env.isTest ? 4 : 12;
const REUSE_GRACE_MS = env.isTest ? 0 : 30_000;
const DUMMY_HASH = bcrypt.hashSync('timing-safe-dummy', BCRYPT_ROUNDS);

export const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  isActive: u.isActive,
  createdAt: u.createdAt,
});

export const hashPassword = (pw) => bcrypt.hash(pw, BCRYPT_ROUNDS);

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwtAccessSecret, {
    expiresIn: env.accessTokenTtl,
  });
}

/** Opaque random refresh token; only its SHA-256 hash is stored. */
async function issueRefreshToken(userId, family = crypto.randomUUID()) {
  const token = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: { tokenHash: sha256(token), family, userId, expiresAt },
  });
  return { token, expiresAt };
}

async function issueSession(user) {
  const refresh = await issueRefreshToken(user.id);
  return { user: publicUser(user), accessToken: signAccessToken(user), refresh };
}

export async function register({ name, email, password }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw ApiError.conflict('An account with this email already exists');
  const user = await prisma.user.create({
    data: { name, email, passwordHash: await hashPassword(password), role: 'APPLICANT' },
  });
  return issueSession(user);
}

export async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  // Always run bcrypt so response time doesn't reveal whether the email exists.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw ApiError.unauthorized('Invalid email or password');
  if (!user.isActive) throw ApiError.forbidden('This account has been disabled');
  return issueSession(user);
}

/**
 * Rotation: each refresh token is single-use. Presenting an already-revoked
 * token means it was stolen/replayed → revoke the whole family.
 */
export async function refresh(rawToken) {
  if (!rawToken) throw ApiError.unauthorized('Missing refresh token');
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(rawToken) },
    include: { user: true },
  });
  if (!stored) throw ApiError.unauthorized('Invalid refresh token');

  if (stored.revokedAt) {
    // Grace window: a page reload or a second tab can present the previous token
    // a moment after it was rotated (the browser never stored the new cookie).
    // Treat that as a benign race and continue the family instead of nuking it.
    const sinceRevoked = Date.now() - stored.revokedAt.getTime();
    if (sinceRevoked < REUSE_GRACE_MS && stored.expiresAt > new Date() && stored.user.isActive) {
      const next = await issueRefreshToken(stored.userId, stored.family);
      return { user: publicUser(stored.user), accessToken: signAccessToken(stored.user), refresh: next };
    }
    await prisma.refreshToken.updateMany({
      where: { family: stored.family, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw ApiError.unauthorized('Refresh token reuse detected; please log in again');
  }
  if (stored.expiresAt < new Date()) throw ApiError.unauthorized('Refresh token expired');
  if (!stored.user.isActive) throw ApiError.forbidden('This account has been disabled');

  // Conditional update guards against two concurrent refreshes with the same token.
  const { count } = await prisma.refreshToken.updateMany({
    where: { id: stored.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0 && REUSE_GRACE_MS === 0) throw ApiError.unauthorized('Refresh token already used');

  const next = await issueRefreshToken(stored.userId, stored.family);
  return {
    user: publicUser(stored.user),
    accessToken: signAccessToken(stored.user),
    refresh: next,
  };
}

export async function logout(rawToken) {
  if (!rawToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
