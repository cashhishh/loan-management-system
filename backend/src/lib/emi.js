/**
 * EMI maths. All money is rounded to 2 decimals (paise).
 *
 * EMI = P * r * (1 + r)^n / ((1 + r)^n - 1)
 *   P = principal, r = monthly rate (annual% / 12 / 100), n = tenure in months
 * For r = 0 the EMI is simply P / n.
 */

export const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

export function calculateEmi(principal, annualRatePercent, tenureMonths) {
  const P = Number(principal);
  const n = Number(tenureMonths);
  const r = Number(annualRatePercent) / 12 / 100;
  if (!(P > 0) || !(n > 0) || !Number.isInteger(n) || r < 0) {
    throw new RangeError('principal and tenure must be positive; rate must be >= 0');
  }
  if (r === 0) return round2(P / n);
  const factor = Math.pow(1 + r, n);
  return round2((P * r * factor) / (factor - 1));
}

export function summarizeLoan(principal, annualRatePercent, tenureMonths) {
  const emi = calculateEmi(principal, annualRatePercent, tenureMonths);
  const schedule = buildSchedule(principal, annualRatePercent, tenureMonths, new Date());
  const totalPayable = round2(schedule.reduce((s, row) => s + row.emiAmount, 0));
  return {
    emi,
    totalPayable,
    totalInterest: round2(totalPayable - Number(principal)),
  };
}

/** Adds `months` calendar months, clamping to the last day (Jan 31 + 1 → Feb 28/29). */
export function addMonths(date, months) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return d;
}

/**
 * Reducing-balance amortisation schedule. The first EMI falls one month after
 * `startDate`. Interest is computed on the rounded outstanding balance each month and
 * the final instalment absorbs any rounding drift so the closing balance is exactly 0.
 */
export function buildSchedule(principal, annualRatePercent, tenureMonths, startDate) {
  const P = Number(principal);
  const n = Number(tenureMonths);
  const r = Number(annualRatePercent) / 12 / 100;
  const emi = calculateEmi(P, annualRatePercent, n);
  const rows = [];
  let balance = round2(P);

  for (let i = 1; i <= n; i++) {
    const interest = round2(balance * r);
    let principalPart = round2(emi - interest);
    let emiAmount = emi;
    if (i === n || principalPart > balance) {
      principalPart = balance;
      emiAmount = round2(principalPart + interest);
    }
    balance = round2(balance - principalPart);
    rows.push({
      installmentNo: i,
      dueDate: addMonths(startDate, i),
      emiAmount,
      principal: principalPart,
      interest,
      balance,
    });
  }
  return rows;
}
