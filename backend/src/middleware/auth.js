import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../utils/ApiError.js';

/** Verifies the Bearer access token and loads a fresh user (so deactivation takes effect immediately). */
export async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw ApiError.unauthorized();

    let payload;
    try {
      payload = jwt.verify(token, env.jwtAccessSecret);
    } catch (e) {
      throw ApiError.unauthorized(e.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    if (!user || !user.isActive) throw ApiError.unauthorized('Account not found or disabled');
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Role guard: authorize('ADMIN') or authorize('OFFICER', 'ADMIN'). */
export const authorize =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    next();
  };
