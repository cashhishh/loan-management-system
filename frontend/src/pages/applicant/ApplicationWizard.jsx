import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import clsx from 'clsx';
import { api, errorMessage } from '../../lib/api';
import { EMPLOYMENT_TYPES, LOAN_TYPES } from '../../lib/constants';
import { money } from '../../lib/format';
import { emiPreview } from '../../lib/emi';
import { useApplication, useApplicationAction, useInvalidateApplication, useLoanProducts } from '../../hooks/queries';
import { Alert, Button, ErrorState, Field, PageHeader, PageLoader } from '../../components/ui';
import { DocumentList, DocumentUploader } from '../../components/application/Documents';
import { ApplicationDetails } from '../../components/application/Details';

const STEPS = [
  {
    key: 'personal',
    title: 'Personal details',
    fields: ['fullName', 'dateOfBirth', 'panNumber', 'addressLine', 'city', 'state', 'pincode'],
  },
  { key: 'loan', title: 'Loan details', fields: ['loanType', 'amount', 'tenureMonths', 'purpose'] },
  { key: 'income', title: 'Income details', fields: ['monthlyIncome', 'employmentType', 'employerName'] },
  { key: 'documents', title: 'Documents', fields: [] },
  { key: 'review', title: 'Review & submit', fields: [] },
];

const req = (msg) => z.string().trim().min(1, msg);
const schema = z.object({
  fullName: req('Full name is required').min(2, 'Name is too short'),
  dateOfBirth: req('Date of birth is required').refine((s) => {
    const d = new Date(s);
    const adult = new Date();
    adult.setFullYear(adult.getFullYear() - 18);
    return d <= adult;
  }, 'You must be at least 18'),
  panNumber: req('PAN is required').regex(/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/, 'PAN must look like ABCDE1234F'),
  addressLine: req('Address is required').min(5, 'Address is too short'),
  city: req('City is required'),
  state: req('State is required'),
  pincode: req('Pincode is required').regex(/^[1-9][0-9]{5}$/, 'Pincode must be 6 digits'),
  loanType: req('Choose a loan type'),
  amount: req('Amount is required').refine((v) => Number(v) > 0, 'Enter a positive amount'),
  tenureMonths: req('Tenure is required').refine(
    (v) => Number.isInteger(Number(v)) && Number(v) > 0,
    'Whole months only',
  ),
  purpose: req('Purpose is required').min(5, 'Describe the purpose (min 5 chars)'),
  monthlyIncome: req('Monthly income is required').refine((v) => Number(v) >= 0, 'Invalid amount'),
  employmentType: req('Choose employment type'),
  employerName: z.string().optional(),
});

const NUMERIC = ['amount', 'tenureMonths', 'monthlyIncome'];
const ALL_FIELDS = STEPS.flatMap((s) => s.fields);

const toForm = (app) =>
  Object.fromEntries(ALL_FIELDS.map((f) => [f, app[f] === null || app[f] === undefined ? '' : String(app[f])]));

function toPayload(values) {
  const out = {};
  for (const f of ALL_FIELDS) {
    const v = typeof values[f] === 'string' ? values[f].trim() : values[f];
    out[f] = v === '' || v === undefined ? null : NUMERIC.includes(f) ? Number(v) : v;
  }
  return out;
}

/** /applications/new — creates a draft and redirects into the wizard. */
export function NewApplication() {
  const navigate = useNavigate();
  const started = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api
      .post('/applications', {})
      .then((r) => navigate(`/applications/${r.data.data.id}/edit`, { replace: true }))
      .catch((e) => setError(errorMessage(e)));
  }, [navigate]);
  return error ? <ErrorState message={error} /> : <PageLoader label="Starting a new application…" />;
}

export default function ApplicationWizard() {
  const { id } = useParams();
  const { data: app, isLoading, error, refetch } = useApplication(id);
  const { data: products } = useLoanProducts();

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;
  if (app.status !== 'DRAFT') {
    return <Navigate to={`/applications/${id}`} replace state={{ justSubmitted: app.status === 'SUBMITTED' }} />;
  }
  return <Wizard app={app} products={products} />;
}

function Wizard({ app, products }) {
  const navigate = useNavigate();
  const invalidate = useInvalidateApplication();
  const submit = useApplicationAction(app.id);
  const [step, setStep] = useState(Math.min(Math.max(app.currentStep || 1, 1), STEPS.length));
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);

  const defaultValues = useMemo(() => toForm(app), [app.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const form = useForm({ resolver: zodResolver(schema), defaultValues, mode: 'onTouched' });
  const {
    register,
    trigger,
    getValues,
    setError,
    control,
    formState: { errors },
  } = form;

  const [loanType, amount, tenure, income] = useWatch({
    control,
    name: ['loanType', 'amount', 'tenureMonths', 'monthlyIncome'],
  });
  const product = products?.[loanType];
  const preview = product ? emiPreview(amount, product.annualRate, tenure) : null;

  async function save(nextStep) {
    setSaving(true);
    setBanner(null);
    try {
      const { data } = await api.patch(`/applications/${app.id}`, { ...toPayload(getValues()), currentStep: nextStep });
      invalidate(app.id);
      return data.data;
    } catch (e) {
      const details = e.response?.data?.error?.details;
      details?.forEach((d) => ALL_FIELDS.includes(d.path) && setError(d.path, { message: d.message }));
      setBanner({ tone: 'red', text: errorMessage(e, 'Could not save') });
      return null;
    } finally {
      setSaving(false);
    }
  }

  function checkProductLimits() {
    if (!product) return true;
    let ok = true;
    const a = Number(amount);
    const t = Number(tenure);
    if (a < product.minAmount || a > product.maxAmount) {
      setError('amount', {
        message: `${product.label}: ${money(product.minAmount, false)} – ${money(product.maxAmount, false)}`,
      });
      ok = false;
    }
    if (t < product.minTenure || t > product.maxTenure) {
      setError('tenureMonths', { message: `${product.label}: ${product.minTenure}–${product.maxTenure} months` });
      ok = false;
    }
    return ok;
  }

  async function next() {
    const fields = STEPS[step - 1].fields;
    if (fields.length && !(await trigger(fields))) return;
    if (STEPS[step - 1].key === 'loan' && !checkProductLimits()) return;
    if (STEPS[step - 1].key === 'documents') {
      const types = new Set(app.documents.map((d) => d.type));
      if (!types.has('ID_PROOF') || !types.has('INCOME_PROOF')) {
        setBanner({ tone: 'amber', text: 'Upload both an ID proof and an income proof to continue.' });
        return;
      }
    }
    const saved = await save(step + 1);
    if (saved) setStep(step + 1);
  }

  async function saveDraft() {
    const saved = await save(step);
    if (saved) setBanner({ tone: 'green', text: 'Draft saved. You can come back and finish it any time.' });
  }

  async function onSubmit() {
    setBanner(null);
    if (!(await trigger())) {
      const firstBad = STEPS.findIndex((s) => s.fields.some((f) => form.getFieldState(f).invalid));
      if (firstBad >= 0) setStep(firstBad + 1);
      setBanner({ tone: 'red', text: 'Some details are missing or invalid.' });
      return;
    }
    const saved = await save(step);
    if (!saved) return;
    submit.mutate(
      { action: 'SUBMIT' },
      {
        onSuccess: () => navigate(`/applications/${app.id}`, { state: { justSubmitted: true } }),
        onError: (e) => setBanner({ tone: 'red', text: errorMessage(e) }),
      },
    );
  }

  const input = (name, props = {}) => (
    <input className={clsx('input', errors[name] && 'input-error')} {...register(name)} {...props} />
  );

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={`Loan application ${app.ref}`}
        subtitle="Your progress is saved as a draft — you can resume any time."
        actions={
          <Button variant="secondary" onClick={saveDraft} loading={saving && !submit.isPending}>
            Save as draft
          </Button>
        }
      />

      {/* Progress indicator */}
      <ol className="mb-6 grid grid-cols-5 gap-2">
        {STEPS.map((s, i) => {
          const n = i + 1;
          return (
            <li key={s.key}>
              <button
                type="button"
                disabled={n > step}
                onClick={() => setStep(n)}
                className="w-full text-left disabled:cursor-default"
              >
                <div
                  className={clsx(
                    'h-1.5 rounded-full',
                    n < step ? 'bg-emerald-500' : n === step ? 'bg-brand-600' : 'bg-slate-200',
                  )}
                />
                <div className={clsx('mt-2 text-xs', n === step ? 'font-semibold text-slate-900' : 'text-slate-500')}>
                  <span className="hidden sm:inline">
                    {n}. {s.title}
                  </span>
                  <span className="sm:hidden">{n}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="card p-5 sm:p-6">
        <h2 className="mb-5 text-lg font-semibold">
          Step {step} of {STEPS.length}: {STEPS[step - 1].title}
        </h2>
        {banner && (
          <div className="mb-4">
            <Alert tone={banner.tone}>{banner.text}</Alert>
          </div>
        )}

        <form onSubmit={(e) => e.preventDefault()} noValidate>
          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name (as on PAN)" error={errors.fullName?.message}>
                {input('fullName', { autoComplete: 'name' })}
              </Field>
              <Field label="Date of birth" error={errors.dateOfBirth?.message}>
                {input('dateOfBirth', { type: 'date', max: new Date().toISOString().slice(0, 10) })}
              </Field>
              <Field label="PAN number" error={errors.panNumber?.message} hint="10 characters, e.g. ABCDE1234F">
                {input('panNumber', {
                  className: clsx('input uppercase', errors.panNumber && 'input-error'),
                  maxLength: 10,
                })}
              </Field>
              <Field label="Pincode" error={errors.pincode?.message}>
                {input('pincode', { inputMode: 'numeric', maxLength: 6 })}
              </Field>
              <Field label="Address" error={errors.addressLine?.message} className="sm:col-span-2">
                {input('addressLine', { autoComplete: 'street-address' })}
              </Field>
              <Field label="City" error={errors.city?.message}>
                {input('city')}
              </Field>
              <Field label="State" error={errors.state?.message}>
                {input('state')}
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Loan type" error={errors.loanType?.message} className="sm:col-span-2">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {Object.entries(LOAN_TYPES).map(([value, label]) => (
                      <label
                        key={value}
                        className={clsx(
                          'cursor-pointer rounded-lg border px-3 py-2.5 text-sm transition',
                          loanType === value
                            ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100'
                            : 'border-slate-300 hover:border-slate-400',
                        )}
                      >
                        <input type="radio" value={value} className="sr-only" {...register('loanType')} />
                        <div className="font-medium">{label}</div>
                        <div className="text-xs text-slate-500">{products?.[value]?.annualRate}% p.a.</div>
                      </label>
                    ))}
                  </div>
                </Field>
                <Field
                  label="Loan amount (₹)"
                  error={errors.amount?.message}
                  hint={product && `${money(product.minAmount, false)} – ${money(product.maxAmount, false)}`}
                >
                  {input('amount', { type: 'number', min: 0, step: 1000, inputMode: 'numeric' })}
                </Field>
                <Field
                  label="Tenure (months)"
                  error={errors.tenureMonths?.message}
                  hint={product && `${product.minTenure} – ${product.maxTenure} months`}
                >
                  {input('tenureMonths', { type: 'number', min: 1, step: 1, inputMode: 'numeric' })}
                </Field>
                <Field label="Purpose" error={errors.purpose?.message} className="sm:col-span-2">
                  <textarea
                    rows={3}
                    className={clsx('input', errors.purpose && 'input-error')}
                    placeholder="e.g. Purchase of a two-wheeler for commuting"
                    {...register('purpose')}
                  />
                </Field>
              </div>
              <EmiCard preview={preview} product={product} income={income} />
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Net monthly income (₹)" error={errors.monthlyIncome?.message}>
                {input('monthlyIncome', { type: 'number', min: 0, step: 500, inputMode: 'numeric' })}
              </Field>
              <Field label="Employment type" error={errors.employmentType?.message}>
                <select
                  className={clsx('input', errors.employmentType && 'input-error')}
                  {...register('employmentType')}
                >
                  <option value="">Select…</option>
                  {Object.entries(EMPLOYMENT_TYPES).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Employer / business name (optional)"
                error={errors.employerName?.message}
                className="sm:col-span-2"
              >
                {input('employerName')}
              </Field>
              {preview && Number(income) > 0 && (
                <div className="sm:col-span-2">
                  <Alert tone={preview.emi / Number(income) > 0.5 ? 'amber' : 'blue'}>
                    Estimated EMI {money(preview.emi)} is {((preview.emi / Number(income)) * 100).toFixed(1)}% of your
                    monthly income. Lenders typically look for 50% or less.
                  </Alert>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Upload a government ID (PAN / Aadhaar / passport) and an income proof (salary slip, ITR or bank
                statement).
              </p>
              <DocumentUploader applicationId={app.id} />
              <DocumentList documents={app.documents} canDelete onDeleted={() => invalidate(app.id)} />
              <ul className="space-y-1 text-sm">
                {['ID_PROOF', 'INCOME_PROOF'].map((t) => {
                  const ok = app.documents.some((d) => d.type === t);
                  return (
                    <li key={t} className={ok ? 'text-emerald-700' : 'text-slate-500'}>
                      {ok ? '✓' : '○'} {t === 'ID_PROOF' ? 'ID proof' : 'Income proof'} {ok ? 'uploaded' : 'required'}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {step === 5 && (
            <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
              <div className="space-y-6">
                <ApplicationDetails app={{ ...app, ...toPayload(getValues()) }} products={products} />
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Documents</h4>
                  <DocumentList documents={app.documents} />
                </div>
              </div>
              <EmiCard preview={preview} product={product} income={income} />
            </div>
          )}

          <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-5">
            <Button variant="ghost" type="button" disabled={step === 1} onClick={() => setStep(step - 1)}>
              ← Back
            </Button>
            {step < STEPS.length ? (
              <Button type="button" onClick={next} loading={saving}>
                Save & continue →
              </Button>
            ) : (
              <Button type="button" variant="success" onClick={onSubmit} loading={saving || submit.isPending}>
                Submit application
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function EmiCard({ preview, product, income }) {
  return (
    <aside className="h-fit rounded-xl bg-gradient-to-br from-brand-600 to-indigo-700 p-5 text-white shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-brand-100">Estimated EMI</p>
      {preview ? (
        <>
          <p className="mt-1 text-3xl font-semibold">{money(preview.emi)}</p>
          <p className="text-xs text-brand-100">per month at {product.annualRate}% p.a.</p>
          <dl className="mt-4 space-y-1.5 border-t border-white/20 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-brand-100">Total interest</dt>
              <dd>{money(preview.totalInterest, false)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-brand-100">Total payable</dt>
              <dd>{money(preview.totalPayable, false)}</dd>
            </div>
            {Number(income) > 0 && (
              <div className="flex justify-between">
                <dt className="text-brand-100">EMI / income</dt>
                <dd>{((preview.emi / Number(income)) * 100).toFixed(1)}%</dd>
              </div>
            )}
          </dl>
        </>
      ) : (
        <p className="mt-2 text-sm text-brand-100">Choose a loan type and enter amount and tenure to see your EMI.</p>
      )}
      <p className="mt-4 text-[11px] leading-snug text-brand-100/80">
        Indicative only, using a fixed sample rate per loan type. Final terms are set on approval.
      </p>
    </aside>
  );
}
