import { useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { errorMessage } from '../../lib/api';
import { LOAN_TYPES } from '../../lib/constants';
import { money } from '../../lib/format';
import { useApplication, useApplicationAction, useLoanProducts } from '../../hooks/queries';
import { Alert, Button, ErrorState, Field, PageHeader, PageLoader, StatusBadge } from '../../components/ui';
import { AuditTimeline, StatusStepper } from '../../components/application/Timeline';
import { DocumentList, DocumentUploader } from '../../components/application/Documents';
import { ApplicationDetails } from '../../components/application/Details';
import { ExportButtons, RepaymentSchedule } from '../../components/application/Schedule';

export default function ApplicationView() {
  const { id } = useParams();
  const location = useLocation();
  const { data: app, isLoading, error, refetch } = useApplication(id);
  const { data: products } = useLoanProducts();
  const [tab, setTab] = useState('overview');

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;
  if (app.status === 'DRAFT') return <Navigate to={`/applications/${id}/edit`} replace />;

  const infoRequest = [...app.history].reverse().find((h) => h.action === 'REQUEST_INFO');
  const decision = [...app.history].reverse().find((h) => ['APPROVE', 'REJECT'].includes(h.action));
  const approved = app.status === 'APPROVED';

  return (
    <div>
      <Link to="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← My applications
      </Link>
      <PageHeader
        title={`${LOAN_TYPES[app.loanType]} loan · ${money(app.amount, false)}`}
        subtitle={`${app.ref} · ${app.tenureMonths} months`}
        actions={
          <>
            <StatusBadge status={app.status} />
            <ExportButtons app={app} />
          </>
        }
      />

      {location.state?.justSubmitted && (
        <div className="mb-4">
          <Alert tone="green">Application submitted! A loan officer will review it shortly.</Alert>
        </div>
      )}

      <div className="card mb-6 p-5">
        <StatusStepper status={app.status} />
      </div>

      {app.status === 'MORE_INFO_NEEDED' && <RespondPanel app={app} request={infoRequest} />}

      {decision && (
        <div className="mb-6">
          <Alert tone={approved ? 'green' : 'red'}>
            <strong>{approved ? 'Approved' : 'Rejected'}.</strong> {decision.note}
          </Alert>
        </div>
      )}

      {approved && (
        <div className="mb-4 flex gap-1 border-b border-slate-200">
          {[
            ['overview', 'Overview'],
            ['schedule', 'Repayment schedule'],
          ].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                tab === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {approved && tab === 'schedule' ? (
        <div className="card p-5">
          <RepaymentSchedule app={app} />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <div className="card p-5">
              <h3 className="mb-4 font-semibold">Application details</h3>
              <ApplicationDetails app={app} products={products} />
            </div>
            <div className="card p-5">
              <h3 className="mb-4 font-semibold">Documents</h3>
              <DocumentList documents={app.documents} />
            </div>
          </div>
          <div className="card h-fit p-5">
            <h3 className="mb-4 font-semibold">Activity</h3>
            <AuditTimeline
              history={app.history.filter((h, i, arr) => i === 0 || h.toStatus !== arr[i - 1].toStatus || h.note)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function RespondPanel({ app, request }) {
  const [note, setNote] = useState('');
  const respond = useApplicationAction(app.id);
  return (
    <div className="card mb-6 border-amber-300 bg-amber-50/40 p-5">
      <h3 className="font-semibold text-amber-900">The loan officer needs more information</h3>
      {request?.note && (
        <blockquote className="mt-2 whitespace-pre-wrap border-l-4 border-amber-400 pl-3 text-sm text-slate-700">
          {request.note}
        </blockquote>
      )}
      <div className="mt-4 space-y-4">
        <DocumentUploader applicationId={app.id} defaultType="OTHER" />
        <Field label="Your response" hint="Explain what you've uploaded or answer the officer's question.">
          <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {respond.error && <Alert>{errorMessage(respond.error)}</Alert>}
        <Button
          variant="warning"
          disabled={note.trim().length < 3}
          loading={respond.isPending}
          onClick={() => respond.mutate({ action: 'RESPOND', note: note.trim() })}
        >
          Send response & resubmit
        </Button>
      </div>
    </div>
  );
}
