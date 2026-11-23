import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ApiError, asyncHandler } from '../../utils/ApiError.js';
import { validate } from '../../middleware/validate.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { uploadSingle, hasValidSignature, UPLOAD_ROOT } from '../../middleware/upload.js';
import { LOAN_PRODUCTS } from '../../config/loanProducts.js';
import { summarizeLoan } from '../../lib/emi.js';
import { APPLICANT_EDITABLE } from '../../lib/workflow.js';
import * as svc from './applications.service.js';
import { toCsv, streamPdf } from './export.js';
import {
  actionSchema,
  createSchema,
  draftSchema,
  emiPreviewSchema,
  idParam,
  installmentParam,
  installmentUpdateSchema,
  listQuery,
  DOCUMENT_TYPES,
} from './applications.schemas.js';

const router = Router();

// ── Public product catalogue + EMI preview (no auth needed) ──
router.get('/loan-products', (_req, res) => res.json({ data: LOAN_PRODUCTS }));

router.post(
  '/emi/preview',
  validate({ body: emiPreviewSchema }),
  (req, res) => {
    const { loanType, amount, tenureMonths } = req.body;
    const rate = LOAN_PRODUCTS[loanType].annualRate;
    res.json({ data: { annualRate: rate, ...summarizeLoan(amount, rate, tenureMonths) } });
  },
);

router.use(authenticate);

// ── Applications ──
router.get(
  '/applications',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => res.json(await svc.list(req.user, req.validatedQuery))),
);

router.get(
  '/applications/stats',
  asyncHandler(async (req, res) => res.json({ data: await svc.stats(req.user) })),
);

router.post(
  '/applications',
  authorize('APPLICANT'),
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => res.status(201).json({ data: await svc.createDraft(req.user, req.body) })),
);

router.get(
  '/applications/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const app = await svc.loadForUser(req.user, req.params.id);
    res.json({ data: svc.serializeApplication(app, req.user) });
  }),
);

router.patch(
  '/applications/:id',
  authorize('APPLICANT'),
  validate({ params: idParam, body: draftSchema }),
  asyncHandler(async (req, res) => res.json({ data: await svc.updateDraft(req.user, req.params.id, req.body) })),
);

router.delete(
  '/applications/:id',
  authorize('APPLICANT'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const docs = await svc.deleteDraft(req.user, req.params.id);
    for (const d of docs) fs.promises.unlink(path.join(UPLOAD_ROOT, d.storedName)).catch(() => {});
    res.status(204).end();
  }),
);

/** Single workflow endpoint: { action, note } — the state machine decides what's allowed. */
router.post(
  '/applications/:id/actions',
  validate({ params: idParam, body: actionSchema }),
  asyncHandler(async (req, res) => res.json({ data: await svc.performAction(req.user, req.params.id, req.body) })),
);

router.post(
  '/applications/:id/eligibility',
  authorize('OFFICER', 'ADMIN'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => res.json({ data: await svc.runEligibility(req.user, req.params.id) })),
);

// ── Repayment schedule ──
router.get(
  '/applications/:id/schedule',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => res.json(await svc.getSchedule(req.user, req.params.id))),
);

router.patch(
  '/applications/:id/schedule/:no',
  authorize('ADMIN'),
  validate({ params: installmentParam, body: installmentUpdateSchema }),
  asyncHandler(async (req, res) =>
    res.json({ data: await svc.updateInstallment(req.user, req.params.id, req.params.no, req.body.status) }),
  ),
);

// ── Export ──
router.get(
  '/applications/:id/export',
  validate({ params: idParam, query: z.object({ format: z.enum(['csv', 'pdf']).default('pdf') }) }),
  asyncHandler(async (req, res) => {
    const raw = await svc.loadForUser(req.user, req.params.id);
    const app = svc.serializeApplication(raw, req.user);
    const name = `${app.ref}-summary`;
    if (req.validatedQuery.format === 'csv') {
      res.type('text/csv').attachment(`${name}.csv`).send(toCsv(app, app.installments));
    } else {
      res.type('application/pdf').attachment(`${name}.pdf`);
      streamPdf(app, app.installments, res);
    }
  }),
);

// ── Documents ──
router.post(
  '/applications/:id/documents',
  authorize('APPLICANT'),
  validate({ params: idParam }),
  uploadSingle,
  asyncHandler(async (req, res) => {
    const file = req.file;
    const cleanup = () => file && fs.promises.unlink(file.path).catch(() => {});
    try {
      if (!file) throw ApiError.badRequest('Attach a file in the "file" field');
      const type = z.enum(DOCUMENT_TYPES).safeParse(req.body.type);
      if (!type.success) throw ApiError.badRequest(`type must be one of ${DOCUMENT_TYPES.join(', ')}`);
      if (!hasValidSignature(file.path, file.mimetype)) {
        throw ApiError.badRequest('File content does not match its type');
      }
      const app = await svc.loadForUser(req.user, req.params.id, {});
      if (app.applicantId !== req.user.id) throw ApiError.forbidden();
      if (!APPLICANT_EDITABLE.includes(app.status)) {
        throw ApiError.conflict(`Documents cannot be added while ${app.status}`);
      }
      const doc = await prisma.document.create({
        data: {
          applicationId: app.id,
          type: type.data,
          originalName: file.originalname.slice(0, 200),
          storedName: file.filename,
          mimeType: file.mimetype,
          size: file.size,
          uploadedById: req.user.id,
        },
      });
      res.status(201).json({ data: doc });
    } catch (err) {
      await cleanup();
      throw err;
    }
  }),
);

async function loadDocument(user, docId) {
  const doc = await prisma.document.findUnique({
    where: { id: docId },
    include: { application: { select: { id: true, applicantId: true, status: true } } },
  });
  if (!doc || !svc.canView(user, doc.application)) throw ApiError.notFound('Document not found');
  return doc;
}

router.get(
  '/documents/:id/file',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const doc = await loadDocument(req.user, req.params.id);
    const filePath = path.join(UPLOAD_ROOT, path.basename(doc.storedName));
    if (!fs.existsSync(filePath)) throw ApiError.notFound('File missing from storage');
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.originalName)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');
    fs.createReadStream(filePath).pipe(res);
  }),
);

router.delete(
  '/documents/:id',
  authorize('APPLICANT'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const doc = await loadDocument(req.user, req.params.id);
    if (doc.application.applicantId !== req.user.id) throw ApiError.forbidden();
    // Once submitted, documents are part of the audit record and can't be removed.
    if (doc.application.status !== 'DRAFT') throw ApiError.conflict('Documents can only be removed from drafts');
    await prisma.document.delete({ where: { id: doc.id } });
    fs.promises.unlink(path.join(UPLOAD_ROOT, doc.storedName)).catch(() => {});
    res.status(204).end();
  }),
);

export default router;
