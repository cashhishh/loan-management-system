import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/api';
import { LOAN_TYPES, STATUS_META } from '../../lib/constants';
import { date, money } from '../../lib/format';
import { useApplications, useApplicationStats } from '../../hooks/queries';
import {
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  PageLoader,
  Pagination,
  StatCard,
  StatusBadge,
} from '../../components/ui';

/**
 * Filterable, paginated application list used by officers (review queue) and admins
 * (approvals + all applications). Filters live in the URL so views are shareable.
 */
export default function ApplicationsQueue({ title, subtitle, presetStatuses, statusOptions, showAssigned }) {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const params = {
    page: Number(sp.get('page') || 1),
    limit: 10,
    status: sp.get('status') ?? presetStatuses ?? '',
    loanType: sp.get('loanType') || '',
    from: sp.get('from') || '',
    to: sp.get('to') || '',
    q: sp.get('q') || '',
    assigned: sp.get('assigned') || '',
    sort: sp.get('sort') || 'submittedAt',
    order: sp.get('order') || 'desc',
  };
  const update = (patch) => {
    const next = { ...params, page: 1, ...patch };
    const out = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      // status is always kept (even "") so "All statuses" overrides a page's preset.
      if (k !== 'limit' && v !== undefined && (v !== '' || k === 'status')) out.set(k, String(v));
    }
    setSp(out, { replace: true });
  };

  // Debounced search box
  const [search, setSearch] = useState(params.q);
  useEffect(() => {
    const t = setTimeout(() => search !== params.q && update({ q: search }), 350);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading, error, refetch, isFetching } = useApplications(params);
  const { data: stats } = useApplicationStats();
  const s = stats?.byStatus ?? {};

  const statCards =
    user.role === 'OFFICER'
      ? [
          ['New (unassigned)', s.SUBMITTED || 0, { status: 'SUBMITTED', assigned: '' }],
          ['My active reviews', stats?.assignedToMe ?? 0, { status: 'UNDER_REVIEW', assigned: 'me' }],
          ['Awaiting applicant', s.MORE_INFO_NEEDED || 0, { status: 'MORE_INFO_NEEDED', assigned: '' }],
          [
            'Sent to admin',
            (s.RECOMMENDED_APPROVAL || 0) + (s.RECOMMENDED_REJECTION || 0),
            { status: 'RECOMMENDED_APPROVAL,RECOMMENDED_REJECTION', assigned: '' },
          ],
        ]
      : [
          [
            'Awaiting decision',
            (s.RECOMMENDED_APPROVAL || 0) + (s.RECOMMENDED_REJECTION || 0),
            { status: 'RECOMMENDED_APPROVAL,RECOMMENDED_REJECTION' },
          ],
          [
            'In review',
            (s.SUBMITTED || 0) + (s.UNDER_REVIEW || 0) + (s.MORE_INFO_NEEDED || 0),
            { status: 'SUBMITTED,UNDER_REVIEW,MORE_INFO_NEEDED' },
          ],
          ['Approved', s.APPROVED || 0, { status: 'APPROVED' }],
          ['Disbursed value', money(stats?.approvedAmount ?? 0, false), { status: 'APPROVED' }],
        ];

  const hasFilters = params.loanType || params.from || params.to || params.q || params.assigned;
  const basePath = user.role === 'OFFICER' ? '/review' : '/admin/applications';

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map(([label, value, patch]) => (
          <StatCard
            key={label}
            label={label}
            value={value}
            onClick={() => update(patch)}
            active={
              params.status === patch.status && (patch.assigned === undefined || params.assigned === patch.assigned)
            }
          />
        ))}
      </div>

      <div className="card">
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <input
            className="input lg:col-span-2"
            placeholder="Search name, PAN, email or LN-number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="input" value={params.status} onChange={(e) => update({ status: e.target.value })}>
            {statusOptions.map(([v, l]) => (
              <option key={l} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select className="input" value={params.loanType} onChange={(e) => update({ loanType: e.target.value })}>
            <option value="">All loan types</option>
            {Object.entries(LOAN_TYPES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <input
            className="input"
            type="date"
            aria-label="Submitted from"
            value={params.from}
            onChange={(e) => update({ from: e.target.value })}
          />
          <input
            className="input"
            type="date"
            aria-label="Submitted to"
            value={params.to}
            onChange={(e) => update({ to: e.target.value })}
          />
          {showAssigned && (
            <select className="input" value={params.assigned} onChange={(e) => update({ assigned: e.target.value })}>
              <option value="">Any officer</option>
              <option value="me">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
            </select>
          )}
          <select
            className="input"
            value={`${params.sort}:${params.order}`}
            onChange={(e) => {
              const [sort, order] = e.target.value.split(':');
              update({ sort, order });
            }}
          >
            <option value="submittedAt:desc">Newest submitted</option>
            <option value="submittedAt:asc">Oldest submitted</option>
            <option value="amount:desc">Highest amount</option>
            <option value="amount:asc">Lowest amount</option>
            <option value="updatedAt:desc">Recently updated</option>
          </select>
          {hasFilters && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch('');
                setSp(new URLSearchParams({ status: params.status }), { replace: true });
              }}
            >
              Clear filters
            </Button>
          )}
        </div>

        {isLoading ? (
          <PageLoader />
        ) : error ? (
          <div className="p-4">
            <ErrorState message={errorMessage(error)} onRetry={refetch} />
          </div>
        ) : !data.data.length ? (
          <EmptyState title="Nothing here" description="No applications match these filters." />
        ) : (
          <div className={`overflow-x-auto transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
            <table className="table w-full min-w-[860px]">
              <thead>
                <tr>
                  <th>Application</th>
                  <th>Applicant</th>
                  <th>Loan</th>
                  <th className="!text-right">Amount</th>
                  <th>Submitted</th>
                  <th>Officer</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.data.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/70">
                    <td className="font-medium text-slate-700">{a.ref}</td>
                    <td>
                      <div className="font-medium">{a.fullName || a.applicant.name}</div>
                      <div className="text-xs text-slate-500">{a.applicant.email}</div>
                    </td>
                    <td>
                      {LOAN_TYPES[a.loanType] ?? '—'}
                      <div className="text-xs text-slate-500">{a.tenureMonths ? `${a.tenureMonths} mo` : ''}</div>
                    </td>
                    <td className="text-right font-medium">{money(a.amount, false)}</td>
                    <td>{date(a.submittedAt)}</td>
                    <td className="text-slate-600">
                      {a.assignedOfficer?.name ?? <span className="text-slate-400">—</span>}
                    </td>
                    <td>
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="text-right">
                      <Link to={`${basePath}/${a.id}`}>
                        <Button size="sm" variant={a.availableActions.length ? 'primary' : 'secondary'}>
                          {a.availableActions.length ? 'Review' : 'Open'}
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination meta={data.meta} onPage={(page) => update({ page })} />}
      </div>
    </div>
  );
}

const ALL = ['', 'All statuses'];
const opt = (statuses, label) => [statuses, label ?? STATUS_META[statuses]?.label];

export const OFFICER_STATUS_OPTIONS = [
  opt('SUBMITTED,UNDER_REVIEW,MORE_INFO_NEEDED', 'Open (needs officer)'),
  opt('SUBMITTED'),
  opt('UNDER_REVIEW'),
  opt('MORE_INFO_NEEDED'),
  opt('RECOMMENDED_APPROVAL,RECOMMENDED_REJECTION', 'Sent to admin'),
  opt('APPROVED'),
  opt('REJECTED'),
  ALL,
];

export const ADMIN_STATUS_OPTIONS = [
  ALL,
  opt('RECOMMENDED_APPROVAL,RECOMMENDED_REJECTION', 'Awaiting final decision'),
  opt('RECOMMENDED_APPROVAL'),
  opt('RECOMMENDED_REJECTION'),
  opt('SUBMITTED'),
  opt('UNDER_REVIEW'),
  opt('MORE_INFO_NEEDED'),
  opt('APPROVED'),
  opt('REJECTED'),
  opt('DRAFT'),
];
