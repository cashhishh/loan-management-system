import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ApiError, asyncHandler } from '../../utils/ApiError.js';
import { validate } from '../../middleware/validate.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { paginationQuery, toSkipTake, pageMeta, csvEnum } from '../../utils/pagination.js';
import { hashPassword, publicUser } from '../auth/auth.service.js';
import { passwordSchema } from '../auth/auth.routes.js';

const ROLES = ['APPLICANT', 'OFFICER', 'ADMIN'];

const listQuery = z.object({
  ...paginationQuery,
  role: csvEnum(ROLES),
  q: z.string().trim().max(100).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: passwordSchema,
  role: z.enum(ROLES),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    role: z.enum(ROLES).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');

const idParam = z.object({ id: z.string().uuid() });

const router = Router();
router.use(authenticate, authorize('ADMIN'));

router.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const q = req.validatedQuery;
    const where = {
      ...(q.role?.length ? { role: { in: q.role } } : {}),
      ...(q.isActive ? { isActive: q.isActive === 'true' } : {}),
      ...(q.q
        ? {
            OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }],
          }
        : {}),
    };
    const [total, users] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(q),
        include: { _count: { select: { applications: true } } },
      }),
    ]);
    res.json({
      data: users.map((u) => ({ ...publicUser(u), applicationCount: u._count.applications })),
      meta: pageMeta(q, total),
    });
  }),
);

router.post(
  '/',
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const { password, ...rest } = req.body;
    const user = await prisma.user.create({
      data: { ...rest, passwordHash: await hashPassword(password) },
    });
    res.status(201).json({ data: publicUser(user) });
  }),
);

router.patch(
  '/:id',
  validate({ params: idParam, body: updateSchema }),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user.id && (req.body.role || req.body.isActive === false)) {
      throw ApiError.badRequest('You cannot change your own role or deactivate yourself');
    }
    const user = await prisma.user.update({ where: { id: req.params.id }, data: req.body });
    if (req.body.isActive === false) {
      // Kill existing sessions of a deactivated user.
      await prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    res.json({ data: publicUser(user) });
  }),
);

export default router;
