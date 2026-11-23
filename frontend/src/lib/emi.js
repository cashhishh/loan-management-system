/** Client-side mirror of backend/src/lib/emi.js for the live EMI preview. */
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

export function emiPreview(principal, annualRate, months) {
  const P = Number(principal);
  const n = Number(months);
  const r = Number(annualRate) / 12 / 100;
  if (!(P > 0) || !(n > 0) || !Number.isInteger(n) || !(r >= 0)) return null;

  const emi = r === 0 ? round2(P / n) : round2((P * r * (1 + r) ** n) / ((1 + r) ** n - 1));
  // Walk the schedule so totals match the server's rounding exactly.
  let balance = round2(P);
  let total = 0;
  for (let i = 1; i <= n; i++) {
    const interest = round2(balance * r);
    let principalPart = round2(emi - interest);
    let pay = emi;
    if (i === n || principalPart > balance) {
      principalPart = balance;
      pay = round2(principalPart + interest);
    }
    balance = round2(balance - principalPart);
    total += pay;
  }
  total = round2(total);
  return { emi, totalPayable: total, totalInterest: round2(total - P) };
}
