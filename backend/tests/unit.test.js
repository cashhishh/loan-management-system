import { describe, it, expect } from 'vitest';
import { calculateEmi, buildSchedule, addMonths, round2 } from '../src/lib/emi.js';
import { evaluateEligibility, ageOn } from '../src/lib/eligibility.js';
import { checkTransition, availableActions } from '../src/lib/workflow.js';

describe('EMI calculation', () => {
  it('matches the standard reducing-balance formula', () => {
    // ₹1,00,000 at 12% p.a. for 12 months → ₹8,884.88 (textbook value)
    expect(calculateEmi(100000, 12, 12)).toBe(8884.88);
    // ₹10,00,000 at 8.5% for 20 years → ₹8,678.23
    expect(calculateEmi(1000000, 8.5, 240)).toBe(8678.23);
  });

  it('handles a zero interest rate', () => {
    expect(calculateEmi(12000, 0, 12)).toBe(1000);
  });

  it('rejects invalid input', () => {
    expect(() => calculateEmi(0, 10, 12)).toThrow(RangeError);
    expect(() => calculateEmi(1000, 10, 0)).toThrow(RangeError);
    expect(() => calculateEmi(1000, 10, 2.5)).toThrow(RangeError);
  });

  it('builds a schedule that fully amortises the principal', () => {
    const rows = buildSchedule(500000, 9.5, 60, new Date('2026-01-31T00:00:00Z'));
    expect(rows).toHaveLength(60);
    expect(rows.at(-1).balance).toBe(0);
    const principalSum = round2(rows.reduce((s, r) => s + r.principal, 0));
    expect(principalSum).toBe(500000);
    for (const r of rows) expect(round2(r.principal + r.interest)).toBe(r.emiAmount);
    // Interest falls every month on a reducing balance
    expect(rows[0].interest).toBeGreaterThan(rows[30].interest);
  });

  it('clamps due dates to month end', () => {
    expect(addMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(addMonths(new Date('2027-12-15T00:00:00Z'), 2).toISOString().slice(0, 10)).toBe('2028-02-15');
  });
});

describe('Eligibility rules', () => {
  const now = new Date('2026-11-23T00:00:00Z');
  const docs = [{ type: 'ID_PROOF' }, { type: 'INCOME_PROOF' }];
  const good = {
    dateOfBirth: '1994-06-15',
    panNumber: 'ABCPS1234K',
    loanType: 'VEHICLE',
    amount: 800000,
    tenureMonths: 60,
    monthlyIncome: 85000,
    employmentType: 'SALARIED',
  };
  const check = (r, code) => r.checks.find((c) => c.code === code);

  it('passes a well-qualified applicant', () => {
    const r = evaluateEligibility(good, docs, now);
    expect(r.passed).toBe(true);
    expect(r.passedCount).toBe(r.total);
    expect(r.metrics.emi).toBeGreaterThan(0);
  });

  it('computes age correctly around birthdays', () => {
    expect(ageOn('2000-11-24', now)).toBe(25);
    expect(ageOn('2000-11-23', now)).toBe(26);
  });

  it('fails applicants younger than 21', () => {
    const r = evaluateEligibility({ ...good, dateOfBirth: '2007-01-01' }, docs, now);
    expect(r.passed).toBe(false);
    expect(check(r, 'AGE').passed).toBe(false);
  });

  it('fails when the loan is too large relative to income', () => {
    const r = evaluateEligibility({ ...good, amount: 4000000, monthlyIncome: 50000 }, docs, now);
    expect(check(r, 'LOAN_TO_INCOME').passed).toBe(false);
    expect(check(r, 'FOIR').passed).toBe(false);
  });

  it('fails when income is below the minimum', () => {
    const r = evaluateEligibility({ ...good, amount: 60000, monthlyIncome: 10000 }, docs, now);
    expect(check(r, 'MIN_INCOME').passed).toBe(false);
  });

  it('flags missing documents', () => {
    const r = evaluateEligibility(good, [{ type: 'ID_PROOF' }], now);
    expect(check(r, 'DOCUMENTS').passed).toBe(false);
    expect(check(r, 'DOCUMENTS').detail).toContain('INCOME_PROOF');
  });

  it('fails unemployed applicants and invalid PANs', () => {
    const r = evaluateEligibility({ ...good, employmentType: 'UNEMPLOYED', panNumber: 'BAD' }, docs, now);
    expect(check(r, 'EMPLOYMENT').passed).toBe(false);
    expect(check(r, 'PAN_FORMAT').passed).toBe(false);
  });

  it('fails when the applicant would be too old at maturity', () => {
    const r = evaluateEligibility(
      {
        ...good,
        loanType: 'HOME',
        dateOfBirth: '1968-01-01',
        amount: 3000000,
        tenureMonths: 240,
        monthlyIncome: 200000,
      },
      docs,
      now,
    );
    expect(check(r, 'AGE_AT_MATURITY').passed).toBe(false);
  });
});

describe('Workflow state machine', () => {
  it('allows only valid transitions for the right role', () => {
    expect(checkTransition('SUBMIT', 'DRAFT', 'APPLICANT')).toEqual({ ok: true, to: 'SUBMITTED' });
    expect(checkTransition('APPROVE', 'UNDER_REVIEW', 'ADMIN').ok).toBe(false);
    expect(checkTransition('APPROVE', 'RECOMMENDED_APPROVAL', 'OFFICER')).toMatchObject({ ok: false, forbidden: true });
    expect(checkTransition('RESPOND', 'MORE_INFO_NEEDED', 'APPLICANT').to).toBe('SUBMITTED');
  });

  it('lists available actions per role', () => {
    expect(availableActions('UNDER_REVIEW', 'OFFICER')).toEqual(
      expect.arrayContaining(['REQUEST_INFO', 'RECOMMEND_APPROVAL', 'RECOMMEND_REJECTION']),
    );
    expect(availableActions('APPROVED', 'ADMIN')).toEqual([]);
  });
});
