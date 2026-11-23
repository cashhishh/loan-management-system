import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { asyncHandler } from '../../utils/ApiError.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import * as auth from './auth.service.js';

const email = z.string().trim().toLowerCase().email('Enter a valid email');
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(100),
  email,
  password: passwordSchema,
});
const loginSchema = z.object({ email, password: z.string().min(1, 'Password is required') });

const COOKIE = 'lms_rt';
// Default deploy serves the SPA from the API origin, so SameSite=Lax works.
// For a split deploy (e.g. Vercel + Render) set COOKIE_SAMESITE=none (requires HTTPS).
const sameSite = process.env.COOKIE_SAMESITE || 'lax';
const cookieOptions = {
  httpOnly: true,
  secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : env.isProd || sameSite === 'none',
  sameSite,
  path: '/api/v1/auth',
};

function sendSession(res, status, session) {
  res.cookie(COOKIE, session.refresh.token, { ...cookieOptions, expires: session.refresh.expiresAt });
  res.status(status).json({ user: session.user, accessToken: session.accessToken });
}

// 10 attempts / 15 min per IP on credential endpoints.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 1000 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { status: 429, message: 'Too many attempts, please try again later' } },
});
const refreshLimiter = rateLimit({ windowMs: 60 * 1000, limit: env.isTest ? 1000 : 30 });

const router = Router();

router.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  asyncHandler(async (req, res) => sendSession(res, 201, await auth.register(req.body))),
);

router.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => sendSession(res, 200, await auth.login(req.body))),
);

router.post(
  '/refresh',
  refreshLimiter,
  asyncHandler(async (req, res) => {
    try {
      sendSession(res, 200, await auth.refresh(req.cookies?.[COOKIE]));
    } catch (err) {
      res.clearCookie(COOKIE, cookieOptions);
      throw err;
    }
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await auth.logout(req.cookies?.[COOKIE]);
    res.clearCookie(COOKIE, cookieOptions);
    res.status(204).end();
  }),
);

router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));

export default router;
