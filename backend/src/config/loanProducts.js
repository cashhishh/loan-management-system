/**
 * Static loan product catalogue. Rates are fixed sample annual rates (% p.a.).
 * In a real system these would live in a DB table with effective dates.
 *
 * incomeMultiplier: max loan amount as a multiple of ANNUAL income.
 */
export const LOAN_PRODUCTS = {
  PERSONAL: {
    label: 'Personal Loan',
    annualRate: 12.5,
    minAmount: 10_000,
    maxAmount: 2_500_000,
    minTenure: 6,
    maxTenure: 60,
    incomeMultiplier: 2,
  },
  HOME: {
    label: 'Home Loan',
    annualRate: 8.5,
    minAmount: 300_000,
    maxAmount: 50_000_000,
    minTenure: 12,
    maxTenure: 360,
    incomeMultiplier: 6,
  },
  VEHICLE: {
    label: 'Vehicle Loan',
    annualRate: 9.5,
    minAmount: 50_000,
    maxAmount: 5_000_000,
    minTenure: 12,
    maxTenure: 84,
    incomeMultiplier: 3,
  },
  BUSINESS: {
    label: 'Business Loan',
    annualRate: 14,
    minAmount: 100_000,
    maxAmount: 10_000_000,
    minTenure: 12,
    maxTenure: 120,
    incomeMultiplier: 3,
  },
};

export const LOAN_TYPES = Object.keys(LOAN_PRODUCTS);

/** Eligibility thresholds — documented in README. */
export const ELIGIBILITY_RULES = {
  minAge: 21,
  maxAge: 60,
  maxAgeAtMaturity: 70,
  minMonthlyIncome: 15_000,
  maxFoir: 0.5, // EMI may be at most 50% of monthly income
  requiredDocuments: ['ID_PROOF', 'INCOME_PROOF'],
};
