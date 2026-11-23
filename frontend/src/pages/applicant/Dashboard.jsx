import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { LOAN_TYPES } from '../../lib/constants';
import { date, money } from '../../lib/format';
import { useApplications, useApplicationStats, useInvalidateApplication } from '../../hooks/queries';
import {
  Alert,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  PageLoader,
  Pagination,
  StatCard,
  StatusBadge,
} from '../../components/ui';
import { StatusStepper } from '../../components/application/Timeline';

const FILTERS = [
  ['', 'All'],
  ['DRAFT', 'Drafts'],
  ['SUBMITTED,UNDER_REVIEW', 'In progress'],
  ['MORE_INFO_NEEDED', 'Action needed'],
  ['APPROVED', 'Approved'],
  ['REJECTED', 'Rejected'],
];

export default function ApplicantDashboard() {
  const navigate = useNavigate();
  const [params, setParams] = useState({ page: 1, limit: 6, status: '' });
  const { data, isLoading, error, refetch, isFetching } = useApplications(params);
  const { data: stats } = useApplicationStats();
  const invalidate = useInvalidateApplication();
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/applications/${id}`),
    onSuccess: (_d, id) => invalidate(id),
  });

  const s = stats?.byStatus ?? {};
  const inProgress = (s.SUBMITTED || 0) + (s.UNDER_REVIEW || 0);

  return (
    <div>
      <PageHeader
        title="My loan applications"
        subtitle="Track every application from draft to EMI schedule."
        actions={<Button onClick={() => navigate('/applications/new')}>+ New application</Button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Drafts" value={s.DRAFT || 0} />
        <StatCard label="In review" value={inProgress} />
        <StatCard label="Action needed" value={s.MORE_INFO_NEEDED || 0} />
        <StatCard label="Approved" value={s.APPROVED || 0} tone="brand" />
      </div>

      {s.MORE_INFO_NEEDED > 0 && (
        <div className="mb-4">
          <Alert tone="amber">
            A loan officer needs more information on {s.MORE_INFO_NEEDED} application(s). Open it to respond.
          </Alert>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(([value, label]) => (
          <button
            key={label}
            onClick={() => setParams((p) => ({ ...p, status: value, page: 1 }))}
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${
              params.status === value
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {remove.error && <Alert>{errorMessage(remove.error)}</Alert>}

      {isLoading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={refetch} />
      ) : !data.data.length ? (
        <div className="card">
          <EmptyState
            title={params.status ? 'No applications match this filter' : 'No applications yet'}
            description="Start an application — it takes about five minutes and you can save it as a draft."
            action={<Button onClick={() => navigate('/applications/new')}>Start an application</Button>}
          />
        </div>
      ) : (
        <div className={`grid gap-4 transition-opacity md:grid-cols-2 ${isFetching ? 'opacity-70' : ''}`}>
          {data.data.map((a) => (
            <div key={a.id} className="card flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-slate-500">{a.ref}</div>
                  <div className="text-lg font-semibold">
                    {a.loanType ? `${LOAN_TYPES[a.loanType]} loan` : 'Untitled application'}
                  </div>
                  <div className="text-sm text-slate-600">
                    {a.amount ? money(a.amount, false) : 'Amount not set'}
                    {a.tenureMonths ? ` · ${a.tenureMonths} months` : ''}
                  </div>
                </div>
                <StatusBadge status={a.status} />
              </div>
              <div className="my-5">
                <StatusStepper status={a.status} />
              </div>
              <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-xs text-slate-500">
                  {a.submittedAt ? `Submitted ${date(a.submittedAt)}` : `Started ${date(a.createdAt)}`}
                </span>
                <div className="flex gap-2">
                  {a.status === 'DRAFT' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600"
                      loading={remove.isPending && remove.variables === a.id}
                      onClick={() => window.confirm('Delete this draft?') && remove.mutate(a.id)}
                    >
                      Delete
                    </Button>
                  )}
                  <Link to={a.status === 'DRAFT' ? `/applications/${a.id}/edit` : `/applications/${a.id}`}>
                    <Button size="sm" variant={a.status === 'MORE_INFO_NEEDED' ? 'warning' : 'secondary'}>
                      {a.status === 'DRAFT' ? 'Resume' : a.status === 'MORE_INFO_NEEDED' ? 'Respond' : 'View'}
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {data && (
        <div className="mt-4">
          <Pagination meta={data.meta} onPage={(page) => setParams((p) => ({ ...p, page }))} />
        </div>
      )}
    </div>
  );
}
