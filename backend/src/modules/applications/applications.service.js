import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import { toSkipTake, pageMeta } from '../../utils/pagination.js';
import { LOAN_PRODUCTS, ELIGIBILITY_RULES } from '../../config/loanProducts.js';
import { buildSchedule } from '../../lib/emi.js';
import { evaluateEligibility } from '../../lib/eligibility.js';
import { ACTIONS, APPLICANT_EDITABLE, availableActions, checkTransition } from '../../lib/workflow.js';
import { notifyStatusChange } from '../../lib/notifier.js';
import { submitSchema } from './applications.schemas.js';

// ───────────────────────── serialization ─────────────────────────

const DECIMALS = ['amount', 'interestRate', 'monthlyIncome'];
const INSTALLMENT_DECIMALS = ['emiAmount', 'principal', 'interest', 'balance'];
const toNum = (v) => (v === null || v === undefined ? v : Number(v));
export const formatRef = (no) => `LN-${String(no).padStart(6, '0')}`;

/** Applicants see the officer recommendation stages simply as "UNDER_REVIEW". */
const HIDDEN_FROM_APPLICANT = { RECOMMENDED_APPROVAL: 'UNDER_REVIEW', RECOMMENDED_REJECTION: 'UNDER_REVIEW' };
const INTERNAL_ACTIONS = ['START_REVIEW', 'RECOMMEND_APPROVAL', 'RECOMMEND_REJECTION', 'RETURN_TO_OFFICER'];
const maskStatus = (s, role) => (role === 'APPLICANT' ? (HIDDEN_FROM_APPLICANT[s] ?? s) : s);

const toDateOnly = (d) => (d ? d.toISOString().slice(0, 10) : d);

export function serializeInstallment(i) {
  const out = { ...i, dueDate: toDateOnly(i.dueDate) };
  for (const k of INSTALLMENT_DECIMALS) out[k] = toNum(i[k]);
  return out;
}

export function serializeApplication(app, viewer) {
  const role = viewer.role;
  const out = {
    ...app,
    ref: formatRef(app.applicationNo),
    status: maskStatus(app.status, role),
    dateOfBirth: toDateOnly(app.dateOfBirth),
    availableActions: availableActions(app.status, role).filter((a) => {
      // Only the assigned officer can act on an application under review.
      if (role === 'OFFICER' && app.status !== 'SUBMITTED') {
        return app.assignedOfficerId === viewer.id;
      }
      return true;
    }),
  };
  for (const k of DECIMALS) out[k] = toNum(app[k]);

  if (app.history) {
    out.history = app.history.map((h) => ({
      ...h,
      fromStatus: h.fromStatus && maskStatus(h.fromStatus, role),
      toStatus: maskStatus(h.toStatus, role),
      // Internal reviewer notes are not shown to applicants.
      note: role === 'APPLICANT' && INTERNAL_ACTIONS.includes(h.action) ? null : h.note,
    }));
  }
  if (app.installments) out.installments = app.installments.map(serializeInstallment);
  if (role === 'APPLICANT') {
    delete out.eligibility;
    delete out.officerNote;
  }
  return out;
}

// ───────────────────────── access control ─────────────────────────

const detailInclude = {
  applicant: { select: { id: true, name: true, email: true } },
  assignedOfficer: { select: { id: true, name: true, email: true } },
  documents: { orderBy: { createdAt: 'asc' } },
  history: {
    orderBy: { createdAt: 'asc' },
    include: { changedBy: { select: { id: true, name: true, role: true } } },
  },
  installments: { orderBy: { installmentNo: 'asc' } },
};

/** Row-level access: applicants only their own; officers everything except drafts; admins all. */
export function canView(user, app) {
  if (user.role === 'ADMIN') return true;
  if (user.role === 'OFFICER') return app.status !== 'DRAFT';
  return app.applicantId === user.id;
}

export async function loadForUser(user, id, include = detailInclude) {
  const app = await prisma.loanApplication.findUnique({ where: { id }, include });
  // 404 (not 403) so we don't reveal which IDs exist.
  if (!app || !canView(user, app)) throw ApiError.notFound('Application not found');
  return app;
}

function assertApplicantEditable(user, app) {
  if (app.applicantId !== user.id) throw ApiError.forbidden('Only the applicant can edit this application');
  if (!APPLICANT_EDITABLE.includes(app.status)) {
    throw ApiError.conflict(`Application cannot be edited while ${app.status}`);
  }
}

// ───────────────────────── queries ─────────────────────────

export async function list(user, q) {
  const and = [];

  if (user.role === 'APPLICANT') and.push({ applicantId: user.id });
  if (user.role === 'OFFICER') and.push({ status: { not: 'DRAFT' } });

  if (q.status?.length) {
    let statuses = q.status;
    if (user.role === 'APPLICANT' && statuses.includes('UNDER_REVIEW')) {
      statuses = [...statuses, 'RECOMMENDED_APPROVAL', 'RECOMMENDED_REJECTION'];
    }
    and.push({ status: { in: statuses } });
  }
  if (q.loanType?.length) and.push({ loanType: { in: q.loanType } });

  const dateField = user.role === 'APPLICANT' ? 'createdAt' : 'submittedAt';
  if (q.from || q.to) {
    const range = {};
    if (q.from) range.gte = new Date(`${q.from}T00:00:00.000Z`);
    if (q.to) range.lte = new Date(`${q.to}T23:59:59.999Z`);
    and.push({ [dateField]: range });
  }
  if (q.assigned === 'me') and.push({ assignedOfficerId: user.id });
  if (q.assigned === 'unassigned') and.push({ assignedOfficerId: null });

  if (q.q) {
    const term = q.q;
    const numeric = Number(term.replace(/^LN-?/i, ''));
    and.push({
      OR: [
        { fullName: { contains: term, mode: 'insensitive' } },
        { panNumber: { contains: term.toUpperCase() } },
        { applicant: { email: { contains: term, mode: 'insensitive' } } },
        ...(Number.isInteger(numeric) && numeric > 0 && numeric < 2 ** 31 ? [{ applicationNo: numeric }] : []),
      ],
    });
  }

  const where = { AND: and };
  const [total, rows] = await prisma.$transaction([
    prisma.loanApplication.count({ where }),
    prisma.loanApplication.findMany({
      where,
      orderBy: [
        { [q.sort]: q.sort === 'submittedAt' ? { sort: q.order, nulls: 'last' } : q.order },
        { applicationNo: 'desc' },
      ],
      ...toSkipTake(q),
      include: {
        applicant: { select: { id: true, name: true, email: true } },
        assignedOfficer: { select: { id: true, name: true } },
        _count: { select: { documents: true } },
      },
    }),
  ]);
  return { data: rows.map((r) => serializeApplication(r, user)), meta: pageMeta(q, total) };
}

export async function stats(user) {
  const where =
    user.role === 'APPLICANT' ? { applicantId: user.id } : user.role === 'OFFICER' ? { status: { not: 'DRAFT' } } : {};
  const grouped = await prisma.loanApplication.groupBy({
    by: ['status'],
    where,
    _count: { _all: true },
    _sum: { amount: true },
  });
  const byStatus = {};
  let approvedAmount = 0;
  for (const g of grouped) {
    const s = maskStatus(g.status, user.role);
    byStatus[s] = (byStatus[s] || 0) + g._count._all;
    if (g.status === 'APPROVED') approvedAmount = Number(g._sum.amount || 0);
  }
  const extra = {};
  if (user.role === 'OFFICER') {
    extra.assignedToMe = await prisma.loanApplication.count({
      where: { assignedOfficerId: user.id, status: 'UNDER_REVIEW' },
    });
  }
  return { byStatus, approvedAmount, ...extra };
}

// ───────────────────────── applicant: drafts ─────────────────────────

const toDbFields = (body) => {
  const data = { ...body };
  if ('dateOfBirth' in data) data.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
  return data;
};

export async function createDraft(user, body) {
  const app = await prisma.loanApplication.create({
    data: {
      ...toDbFields(body),
      applicantId: user.id,
      fullName: body.fullName ?? user.name,
      history: { create: { toStatus: 'DRAFT', action: 'CREATE', changedById: user.id } },
    },
    include: detailInclude,
  });
  return serializeApplication(app, user);
}

export async function updateDraft(user, id, body) {
  const app = await loadForUser(user, id, {});
  assertApplicantEditable(user, app);
  const updated = await prisma.loanApplication.update({
    where: { id },
    data: toDbFields(body),
    include: detailInclude,
  });
  return serializeApplication(updated, user);
}

export async function deleteDraft(user, id) {
  const app = await loadForUser(user, id, { documents: true });
  if (app.applicantId !== user.id) throw ApiError.forbidden();
  if (app.status !== 'DRAFT') throw ApiError.conflict('Only drafts can be deleted');
  await prisma.loanApplication.delete({ where: { id } });
  return app.documents;
}

// ───────────────────────── review: eligibility ─────────────────────────

export async function runEligibility(user, id) {
  const app = await loadForUser(user, id, { documents: { select: { type: true } } });
  if (app.status === 'DRAFT') throw ApiError.conflict('Draft applications cannot be evaluated');
  const result = evaluateEligibility(app, app.documents);
  const eligibility = {
    ...result,
    evaluatedAt: new Date().toISOString(),
    evaluatedBy: { id: user.id, name: user.name },
  };
  await prisma.loanApplication.update({ where: { id }, data: { eligibility } });
  return eligibility;
}

// ───────────────────────── workflow transitions ─────────────────────────

function validateForSubmission(app) {
  const parsed = submitSchema.safeParse({
    ...app,
    dateOfBirth: toDateOnly(app.dateOfBirth),
    amount: toNum(app.amount),
    monthlyIncome: toNum(app.monthlyIncome),
  });
  const details = parsed.success
    ? []
    : parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  const types = new Set(app.documents.map((d) => d.type));
  for (const t of ELIGIBILITY_RULES.requiredDocuments) {
    if (!types.has(t)) details.push({ path: 'documents', message: `${t} document is required` });
  }
  if (details.length) throw ApiError.unprocessable('Application is incomplete', details);
}

/**
 * Executes a workflow action atomically: status update (guarded by the expected
 * current status → optimistic concurrency), audit-trail row and, on approval,
 * the EMI schedule — all in one transaction.
 */
export async function performAction(user, id, { action, note }) {
  const app = await loadForUser(user, id, {
    documents: { select: { type: true } },
    applicant: { select: { email: true, name: true } },
  });

  const check = checkTransition(action, app.status, user.role);
  if (!check.ok) throw check.forbidden ? ApiError.forbidden(check.reason) : ApiError.conflict(check.reason);
  const def = ACTIONS[action];
  if (def.noteRequired && !note) throw ApiError.badRequest('A note is required for this action');

  const data = { status: check.to };

  switch (action) {
    case 'SUBMIT':
    case 'RESPOND':
      if (app.applicantId !== user.id) throw ApiError.forbidden();
      validateForSubmission(app);
      data.interestRate = new Prisma.Decimal(LOAN_PRODUCTS[app.loanType].annualRate);
      data.submittedAt = new Date();
      break;
    case 'START_REVIEW':
      data.assignedOfficerId = user.id;
      break;
    case 'REQUEST_INFO':
    case 'RECOMMEND_APPROVAL':
    case 'RECOMMEND_REJECTION':
      if (user.role === 'OFFICER' && app.assignedOfficerId !== user.id) {
        throw ApiError.forbidden('This application is assigned to another officer');
      }
      if (def.requiresEligibility && !app.eligibility) {
        throw ApiError.unprocessable('Run the eligibility check before making a recommendation');
      }
      data.officerNote = note;
      break;
    case 'APPROVE':
    case 'REJECT':
      data.adminRemarks = note;
      data.decidedAt = new Date();
      break;
    default:
      break;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const { count } = await tx.loanApplication.updateMany({
      where: { id, status: app.status },
      data,
    });
    if (count === 0) throw ApiError.conflict('Application was modified by someone else; refresh and retry');

    await tx.statusHistory.create({
      data: {
        applicationId: id,
        fromStatus: app.status,
        toStatus: check.to,
        action,
        note: note || null,
        changedById: user.id,
      },
    });

    if (action === 'APPROVE') {
      const rate = Number(app.interestRate ?? LOAN_PRODUCTS[app.loanType].annualRate);
      const rows = buildSchedule(Number(app.amount), rate, app.tenureMonths, data.decidedAt);
      await tx.installment.createMany({ data: rows.map((r) => ({ ...r, applicationId: id })) });
    }

    return tx.loanApplication.findUnique({ where: { id }, include: detailInclude });
  });

  notifyStatusChange({
    to: app.applicant.email,
    name: app.applicant.name,
    applicationNo: app.applicationNo,
    status: maskStatus(check.to, 'APPLICANT'),
    note: ['REQUEST_INFO', 'APPROVE', 'REJECT'].includes(action) ? note : undefined,
  });

  return serializeApplication(updated, user);
}

// ───────────────────────── repayment schedule ─────────────────────────

export async function getSchedule(user, id) {
  const app = await loadForUser(user, id, { installments: { orderBy: { installmentNo: 'asc' } } });
  if (app.status !== 'APPROVED') throw ApiError.notFound('No repayment schedule — loan is not approved');
  const installments = app.installments.map(serializeInstallment);
  const today = new Date().toISOString().slice(0, 10);
  const sum = (arr, k) => Math.round(arr.reduce((s, r) => s + r[k], 0) * 100) / 100;
  const paid = installments.filter((i) => i.status === 'PAID');
  return {
    data: installments.map((i) => ({ ...i, isPastDue: i.status !== 'PAID' && i.dueDate < today })),
    summary: {
      emi: installments[0]?.emiAmount ?? 0,
      totalPayable: sum(installments, 'emiAmount'),
      totalInterest: sum(installments, 'interest'),
      paidCount: paid.length,
      paidAmount: sum(paid, 'emiAmount'),
      overdueCount: installments.filter((i) => i.status === 'OVERDUE').length,
      outstandingPrincipal: Math.round((Number(app.amount) - sum(paid, 'principal')) * 100) / 100,
    },
  };
}

export async function updateInstallment(user, id, no, status) {
  const app = await loadForUser(user, id, {});
  if (app.status !== 'APPROVED') throw ApiError.conflict('Loan is not approved');
  const inst = await prisma.installment.update({
    where: { applicationId_installmentNo: { applicationId: id, installmentNo: no } },
    data: {
      status,
      paidAt: status === 'PAID' ? new Date() : null,
      markedById: user.id,
    },
  });
  return serializeInstallment(inst);
}
