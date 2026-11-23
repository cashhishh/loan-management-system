import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useAuth } from '../../context/AuthContext';
import { api, errorMessage } from '../../lib/api';
import { LOAN_TYPES } from '../../lib/constants';
import { dateTime, money } from '../../lib/format';
import { useApplication, useApplicationAction, useLoanProducts } from '../../hooks/queries';
import {
  Alert,
  Badge,
  Button,
  ErrorState,
  Field,
  Modal,
  PageHeader,
  PageLoader,
  StatusBadge,
} from '../../components/ui';
import { AuditTimeline } from '../../components/application/Timeline';
import { DocumentList } from '../../components/application/Documents';
import { ApplicationDetails } from '../../components/application/Details';
import { ExportButtons, RepaymentSchedule } from '../../components/application/Schedule';

const ACTION_UI = {
  START_REVIEW: { label: 'Start review', variant: 'primary', confirm: false },
  REQUEST_INFO: {
    label: 'Request more info',
    variant: 'warning',
    prompt: 'Message to the applicant',
    placeholder: 'e.g. Please upload your last 3 months of bank statements.',
  },
  RECOMMEND_APPROVAL: { label: 'Recommend approval', variant: 'success', prompt: 'Recommendation note for admin' },
  RECOMMEND_REJECTION: {
    label: 'Recommend rejection',
    variant: 'danger',
    prompt: 'Reason for rejection recommendation',
  },
  APPROVE: { label: 'Approve loan', variant: 'success', prompt: 'Approval remarks (visible to applicant)' },
  REJECT: { label: 'Reject loan', variant: 'danger', prompt: 'Rejection remarks (visible to applicant)' },
  RETURN_TO_OFFICER: { label: 'Return to officer', variant: 'secondary', prompt: 'What should the officer re-check?' },
};

export default function ReviewDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: app, isLoading, error, refetch } = useApplication(id);
  const { data: products } = useLoanProducts();
  const [tab, setTab] = useState('details');

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  const back = user.role === 'OFFICER' ? '/review' : '/admin/applications';
  const tabs = [
    ['details', 'Details & documents'],
    ['history', `Audit trail (${app.history.length})`],
    ...(app.status === 'APPROVED' ? [['schedule', 'EMI schedule']] : []),
  ];

  return (
    <div>
      <Link to={back} className="text-sm text-brand-600 hover:underline">
        ← Back to list
      </Link>
      <PageHeader
        title={`${app.fullName ?? app.applicant.name} · ${LOAN_TYPES[app.loanType] ?? ''} loan`}
        subtitle={`${app.ref} · ${money(app.amount, false)} over ${app.tenureMonths ?? '—'} months · submitted ${dateTime(app.submittedAt)}`}
        actions={
          <>
            <StatusBadge status={app.status} />
            <ExportButtons app={app} />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
            {tabs.map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={clsx(
                  '-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium',
                  tab === k
                    ? 'border-brand-600 text-brand-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700',
                )}
              >
                {l}
              </button>
            ))}
          </div>

          {tab === 'details' && (
            <div className="space-y-6">
              <div className="card p-5">
                <ApplicationDetails app={app} products={products} />
              </div>
              <div className="card p-5">
                <h3 className="mb-3 font-semibold">Uploaded documents</h3>
                <DocumentList documents={app.documents} />
              </div>
            </div>
          )}
          {tab === 'history' && (
            <div className="card p-5">
              <AuditTimeline history={app.history} />
            </div>
          )}
          {tab === 'schedule' && (
            <div className="card p-5">
              <RepaymentSchedule app={app} canMark={user.role === 'ADMIN'} />
            </div>
          )}
        </div>

        <div className="space-y-6">
          <ActionPanel app={app} user={user} />
          <EligibilityPanel app={app} />
          {(app.officerNote || app.adminRemarks) && (
            <div className="card space-y-3 p-5 text-sm">
              {app.officerNote && (
                <div>
                  <div className="text-xs font-semibold uppercase text-slate-500">Officer note</div>
                  <p className="mt-1 whitespace-pre-wrap">{app.officerNote}</p>
                </div>
              )}
              {app.adminRemarks && (
                <div>
                  <div className="text-xs font-semibold uppercase text-slate-500">Admin remarks</div>
                  <p className="mt-1 whitespace-pre-wrap">{app.adminRemarks}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionPanel({ app, user }) {
  const action = useApplicationAction(app.id);
  const [pending, setPending] = useState(null);
  const [note, setNote] = useState('');
  const actions = app.availableActions;
  const needsEligibility = (a) => a.startsWith('RECOMMEND') && !app.eligibility;

  const run = (a, n) =>
    action.mutate(
      { action: a, note: n || undefined },
      {
        onSuccess: () => {
          setPending(null);
          setNote('');
        },
      },
    );

  let help = null;
  if (!actions.length) {
    if (user.role === 'OFFICER' && app.status === 'UNDER_REVIEW' && app.assignedOfficerId !== user.id) {
      help = `Being reviewed by ${app.assignedOfficer?.name}.`;
    } else if (['APPROVED', 'REJECTED'].includes(app.status)) {
      help = `Final decision recorded ${dateTime(app.decidedAt)}.`;
    } else if (app.status === 'MORE_INFO_NEEDED') {
      help = 'Waiting for the applicant to respond.';
    } else if (app.status.startsWith('RECOMMENDED')) {
      help = 'Waiting for the admin’s final decision.';
    } else {
      help = 'No actions available for your role at this stage.';
    }
  }

  return (
    <div className="card p-5">
      <h3 className="mb-3 font-semibold">{user.role === 'ADMIN' ? 'Decision' : 'Review actions'}</h3>
      {action.error && !pending && (
        <div className="mb-3">
          <Alert>{errorMessage(action.error)}</Alert>
        </div>
      )}
      {help && <p className="text-sm text-slate-500">{help}</p>}
      <div className="flex flex-col gap-2">
        {actions.map((a) => (
          <Button
            key={a}
            variant={ACTION_UI[a]?.variant}
            disabled={needsEligibility(a)}
            title={needsEligibility(a) ? 'Run the eligibility check first' : undefined}
            loading={action.isPending && action.variables?.action === a}
            onClick={() => (ACTION_UI[a]?.prompt ? setPending(a) : run(a))}
          >
            {ACTION_UI[a]?.label ?? a}
          </Button>
        ))}
      </div>
      {actions.some(needsEligibility) && (
        <p className="mt-2 text-xs text-slate-500">Run the eligibility check before recommending.</p>
      )}

      <Modal open={!!pending} onClose={() => setPending(null)} title={ACTION_UI[pending]?.label}>
        <Field label={ACTION_UI[pending]?.prompt}>
          <textarea
            className="input"
            rows={4}
            autoFocus
            value={note}
            placeholder={ACTION_UI[pending]?.placeholder}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        {action.error && (
          <div className="mt-3">
            <Alert>{errorMessage(action.error)}</Alert>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setPending(null)}>
            Cancel
          </Button>
          <Button
            variant={ACTION_UI[pending]?.variant}
            disabled={note.trim().length < 3}
            loading={action.isPending}
            onClick={() => run(pending, note.trim())}
          >
            Confirm
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function EligibilityPanel({ app }) {
  const qc = useQueryClient();
  const run = useMutation({
    mutationFn: () => api.post(`/applications/${app.id}/eligibility`).then((r) => r.data.data),
    onSuccess: (eligibility) => qc.setQueryData(['application', app.id], (old) => ({ ...old, eligibility })),
  });
  const e = app.eligibility;
  const canRun = !['DRAFT', 'APPROVED', 'REJECTED'].includes(app.status);

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">Eligibility check</h3>
        {e && (
          <Badge tone={e.passed ? 'green' : 'red'}>
            {e.passed ? 'PASS' : 'FAIL'} · {e.passedCount}/{e.total}
          </Badge>
        )}
      </div>
      {run.error && <Alert>{errorMessage(run.error)}</Alert>}
      {e ? (
        <>
          <ul className="space-y-2">
            {e.checks.map((c) => (
              <li key={c.code} className="flex gap-2.5 text-sm">
                <span
                  className={clsx(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white',
                    c.passed ? 'bg-emerald-500' : 'bg-red-500',
                  )}
                >
                  {c.passed ? '✓' : '✕'}
                </span>
                <div>
                  <div className="font-medium text-slate-800">{c.label}</div>
                  <div className="text-xs text-slate-500">{c.detail}</div>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-400">
            Run {dateTime(e.evaluatedAt)} by {e.evaluatedBy?.name}
          </p>
        </>
      ) : (
        <p className="text-sm text-slate-500">
          Not run yet. Checks age, PAN, income, loan-to-income, EMI affordability, product limits and documents.
        </p>
      )}
      {canRun && (
        <Button variant="secondary" className="mt-4 w-full" loading={run.isPending} onClick={() => run.mutate()}>
          {e ? 'Re-run check' : 'Run eligibility check'}
        </Button>
      )}
    </div>
  );
}
