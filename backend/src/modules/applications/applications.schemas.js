import { z } from 'zod';
import { LOAN_PRODUCTS, LOAN_TYPES } from '../../config/loanProducts.js';
import { ACTION_NAMES } from '../../lib/workflow.js';
import { paginationQuery, csvEnum } from '../../utils/pagination.js';

export const STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'MORE_INFO_NEEDED',
  'RECOMMENDED_APPROVAL',
  'RECOMMENDED_REJECTION',
  'APPROVED',
  'REJECTED',
];
export const EMPLOYMENT_TYPES = ['SALARIED', 'SELF_EMPLOYED', 'BUSINESS_OWNER', 'UNEMPLOYED'];
export const DOCUMENT_TYPES = ['ID_PROOF', 'INCOME_PROOF', 'OTHER'];

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date');

/** Field-level rules shared by draft (all optional) and submit (all required). */
const fields = {
  fullName: z.string().trim().min(2, 'Name is too short').max(100),
  dateOfBirth: isoDate.refine((s) => new Date(s) < new Date(), 'Date of birth must be in the past'),
  panNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'PAN must look like ABCDE1234F'),
  addressLine: z.string().trim().min(5, 'Address is too short').max(200),
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().min(2).max(60),
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, 'Pincode must be 6 digits'),
  loanType: z.enum(LOAN_TYPES),
  amount: z.coerce.number().positive('Amount must be positive').max(100_000_000),
  tenureMonths: z.coerce.number().int('Tenure must be whole months').min(1).max(360),
  purpose: z.string().trim().min(5, 'Describe the purpose (min 5 chars)').max(500),
  monthlyIncome: z.coerce.number().min(0).max(100_000_000),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  employerName: z.string().trim().max(120),
};

const optionalFields = Object.fromEntries(
  Object.entries(fields).map(([k, v]) => [k, v.nullable().optional()]),
);

/** PATCH /applications/:id — partial save of any step. */
export const draftSchema = z
  .object({ ...optionalFields, currentStep: z.coerce.number().int().min(1).max(5).optional() })
  .strict();

function productLimits(data, ctx) {
  const p = LOAN_PRODUCTS[data.loanType];
  if (!p) return;
  if (data.amount < p.minAmount || data.amount > p.maxAmount) {
    ctx.addIssue({
      code: 'custom',
      path: ['amount'],
      message: `${p.label} amount must be between ${p.minAmount} and ${p.maxAmount}`,
    });
  }
  if (data.tenureMonths < p.minTenure || data.tenureMonths > p.maxTenure) {
    ctx.addIssue({
      code: 'custom',
      path: ['tenureMonths'],
      message: `${p.label} tenure must be ${p.minTenure}–${p.maxTenure} months`,
    });
  }
  const dob = new Date(data.dateOfBirth);
  const eighteen = new Date(dob.getFullYear() + 18, dob.getMonth(), dob.getDate());
  if (eighteen > new Date()) {
    ctx.addIssue({ code: 'custom', path: ['dateOfBirth'], message: 'Applicant must be 18 or older' });
  }
}

/** Full validation applied when the applicant submits. */
export const submitSchema = z
  .object({ ...fields, employerName: fields.employerName.nullable().optional() })
  .superRefine(productLimits);

export const createSchema = draftSchema;

export const listQuery = z.object({
  ...paginationQuery,
  status: csvEnum(STATUSES),
  loanType: csvEnum(LOAN_TYPES),
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().trim().max(100).optional(),
  assigned: z.enum(['me', 'unassigned']).optional(),
  sort: z.enum(['createdAt', 'submittedAt', 'updatedAt', 'amount']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const actionSchema = z.object({
  action: z.enum(ACTION_NAMES),
  note: z.string().trim().max(1000).optional(),
});

export const installmentUpdateSchema = z.object({
  status: z.enum(['PENDING', 'PAID', 'OVERDUE']),
});

export const idParam = z.object({ id: z.string().uuid() });
export const installmentParam = z.object({
  id: z.string().uuid(),
  no: z.coerce.number().int().min(1),
});

export const emiPreviewSchema = z.object({
  loanType: z.enum(LOAN_TYPES),
  amount: z.coerce.number().positive(),
  tenureMonths: z.coerce.number().int().min(1).max(360),
});
