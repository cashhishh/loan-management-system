import { ELIGIBILITY_RULES, LOAN_PRODUCTS } from '../config/loanProducts.js';
import { calculateEmi, round2 } from './emi.js';

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function ageOn(dob, onDate = new Date()) {
  const birth = new Date(dob);
  let age = onDate.getUTCFullYear() - birth.getUTCFullYear();
  const m = onDate.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && onDate.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

const fmt = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * Deterministic, rule-based eligibility check. Pure function: same input → same output.
 *
 * @param {object} app  application fields (dateOfBirth, panNumber, loanType, amount,
 *                      tenureMonths, monthlyIncome, employmentType, interestRate?)
 * @param {Array<{type:string}>} documents uploaded documents
 * @param {Date} [now]
 * @returns {{ passed: boolean, passedCount: number, total: number, checks: Array, metrics: object }}
 */
export function evaluateEligibility(app, documents = [], now = new Date()) {
  const rules = ELIGIBILITY_RULES;
  const product = LOAN_PRODUCTS[app.loanType];
  const checks = [];
  const add = (code, label, passed, detail) => checks.push({ code, label, passed, detail });

  const amount = Number(app.amount);
  const tenure = Number(app.tenureMonths);
  const income = Number(app.monthlyIncome);
  const rate = Number(app.interestRate ?? product?.annualRate);

  // 1. Age window
  if (!app.dateOfBirth) {
    add('AGE', 'Applicant age', false, 'Date of birth missing');
  } else {
    const age = ageOn(app.dateOfBirth, now);
    add(
      'AGE',
      `Age between ${rules.minAge} and ${rules.maxAge}`,
      age >= rules.minAge && age <= rules.maxAge,
      `Applicant is ${age} years old`,
    );
    if (tenure > 0) {
      const ageAtMaturity = age + Math.ceil(tenure / 12);
      add(
        'AGE_AT_MATURITY',
        `Age at loan maturity ≤ ${rules.maxAgeAtMaturity}`,
        ageAtMaturity <= rules.maxAgeAtMaturity,
        `Applicant will be ~${ageAtMaturity} at the last EMI`,
      );
    }
  }

  // 2. Identity
  add(
    'PAN_FORMAT',
    'Valid PAN format',
    PAN_REGEX.test(app.panNumber || ''),
    app.panNumber ? `PAN ${app.panNumber}` : 'PAN missing',
  );

  // 3. Employment
  add(
    'EMPLOYMENT',
    'Has a source of income',
    !!app.employmentType && app.employmentType !== 'UNEMPLOYED',
    app.employmentType ? `Employment: ${app.employmentType}` : 'Employment type missing',
  );

  // 4. Minimum income
  add(
    'MIN_INCOME',
    `Monthly income ≥ ${fmt(rules.minMonthlyIncome)}`,
    income >= rules.minMonthlyIncome,
    `Declared monthly income ${fmt(income || 0)}`,
  );

  // 5. Loan-to-income ratio (amount vs annual income)
  let loanToIncome = null;
  if (product && income > 0) {
    loanToIncome = round2(amount / (income * 12));
    add(
      'LOAN_TO_INCOME',
      `Loan ≤ ${product.incomeMultiplier}× annual income`,
      loanToIncome <= product.incomeMultiplier,
      `Loan is ${loanToIncome}× annual income (max ${product.incomeMultiplier}×)`,
    );
  } else {
    add('LOAN_TO_INCOME', 'Loan-to-income ratio', false, 'Loan type or income missing');
  }

  // 6. FOIR — EMI affordability
  let emi = null;
  let foir = null;
  if (amount > 0 && tenure > 0 && income > 0 && Number.isFinite(rate)) {
    emi = calculateEmi(amount, rate, tenure);
    foir = round2(emi / income);
    add(
      'FOIR',
      `EMI ≤ ${rules.maxFoir * 100}% of monthly income`,
      foir <= rules.maxFoir,
      `EMI ${fmt(emi)} is ${round2(foir * 100)}% of income`,
    );
  } else {
    add('FOIR', 'EMI affordability', false, 'Amount, tenure or income missing');
  }

  // 7. Product limits
  if (product) {
    add(
      'PRODUCT_LIMITS',
      `Within ${product.label} limits`,
      amount >= product.minAmount &&
        amount <= product.maxAmount &&
        tenure >= product.minTenure &&
        tenure <= product.maxTenure,
      `Allowed ${fmt(product.minAmount)}–${fmt(product.maxAmount)}, ${product.minTenure}–${product.maxTenure} months`,
    );
  }

  // 8. Required documents
  const uploaded = new Set(documents.map((d) => d.type));
  const missing = rules.requiredDocuments.filter((t) => !uploaded.has(t));
  add(
    'DOCUMENTS',
    'Required documents uploaded',
    missing.length === 0,
    missing.length ? `Missing: ${missing.join(', ')}` : 'ID proof and income proof present',
  );

  const passedCount = checks.filter((c) => c.passed).length;
  return {
    passed: passedCount === checks.length,
    passedCount,
    total: checks.length,
    checks,
    metrics: { emi, foir, loanToIncome },
  };
}
