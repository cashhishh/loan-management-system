import { EMPLOYMENT_TYPES, LOAN_TYPES } from '../../lib/constants';
import { date, money } from '../../lib/format';
import { emiPreview } from '../../lib/emi';

function Section({ title, rows }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="flex justify-between gap-3 border-b border-dashed border-slate-100 pb-1.5 text-sm sm:block sm:border-0 sm:pb-0"
          >
            <dt className="text-slate-500">{k}</dt>
            <dd className="text-right font-medium text-slate-800 sm:text-left">{v || '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ApplicationDetails({ app, products }) {
  const rate = app.interestRate ?? products?.[app.loanType]?.annualRate;
  const preview =
    app.amount && app.tenureMonths && rate != null ? emiPreview(app.amount, rate, app.tenureMonths) : null;
  return (
    <div className="space-y-6">
      <Section
        title="Personal"
        rows={[
          ['Full name', app.fullName],
          ['Date of birth', date(app.dateOfBirth)],
          ['PAN', app.panNumber],
          ['Address', [app.addressLine, app.city, app.state, app.pincode].filter(Boolean).join(', ')],
        ]}
      />
      <Section
        title="Loan"
        rows={[
          ['Type', LOAN_TYPES[app.loanType]],
          ['Amount', money(app.amount)],
          ['Tenure', app.tenureMonths && `${app.tenureMonths} months`],
          ['Interest rate', rate != null && `${rate}% p.a.`],
          ['Estimated EMI', preview && money(preview.emi)],
          ['Purpose', app.purpose],
        ]}
      />
      <Section
        title="Income"
        rows={[
          ['Monthly income', money(app.monthlyIncome)],
          ['Employment', EMPLOYMENT_TYPES[app.employmentType]],
          ['Employer', app.employerName],
        ]}
      />
    </div>
  );
}
