import clsx from 'clsx';
import { ACTION_META, ROLE_LABEL, STATUS_META } from '../../lib/constants';
import { dateTime } from '../../lib/format';
import { StatusBadge } from '../ui';

const MILESTONES = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'DECISION'];

/** Horizontal progress: Draft → Submitted → Under review → Approved / Rejected / More info. */
export function StatusStepper({ status }) {
  const index = {
    DRAFT: 0,
    SUBMITTED: 1,
    MORE_INFO_NEEDED: 2,
    UNDER_REVIEW: 2,
    RECOMMENDED_APPROVAL: 2,
    RECOMMENDED_REJECTION: 2,
    APPROVED: 3,
    REJECTED: 3,
  }[status];
  const finalLabel = status === 'APPROVED' ? 'Approved' : status === 'REJECTED' ? 'Rejected' : 'Decision';
  const labels = [
    'Draft',
    'Submitted',
    status === 'MORE_INFO_NEEDED' ? 'More info needed' : 'Under review',
    finalLabel,
  ];

  return (
    <ol className="flex items-center">
      {MILESTONES.map((m, i) => {
        const done = i < index || (i === index && i === 3);
        const current = i === index && i !== 3;
        const warn = current && status === 'MORE_INFO_NEEDED';
        const bad = i === 3 && status === 'REJECTED';
        return (
          <li key={m} className={clsx('flex items-center', i < MILESTONES.length - 1 && 'flex-1')}>
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={clsx(
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ring-4 ring-white',
                  bad
                    ? 'bg-red-500 text-white'
                    : done
                      ? 'bg-emerald-500 text-white'
                      : warn
                        ? 'bg-amber-500 text-white'
                        : current
                          ? 'bg-brand-600 text-white'
                          : 'bg-slate-200 text-slate-500',
                )}
              >
                {bad ? '✕' : done ? '✓' : i + 1}
              </span>
              <span
                className={clsx(
                  'whitespace-nowrap text-xs',
                  current || done ? 'font-medium text-slate-800' : 'text-slate-400',
                )}
              >
                {labels[i]}
              </span>
            </div>
            {i < MILESTONES.length - 1 && (
              <div className={clsx('mx-2 mb-5 h-0.5 flex-1', i < index ? 'bg-emerald-500' : 'bg-slate-200')} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Vertical audit trail: who changed what, when and why. */
export function AuditTimeline({ history = [] }) {
  if (!history.length) return <p className="text-sm text-slate-500">No activity yet.</p>;
  return (
    <ol className="relative space-y-5 border-l border-slate-200 pl-5">
      {[...history].reverse().map((h) => (
        <li key={h.id} className="relative">
          <span
            className={clsx(
              'absolute -left-[26px] top-1 h-3 w-3 rounded-full ring-4 ring-white',
              {
                green: 'bg-emerald-500',
                red: 'bg-red-500',
                amber: 'bg-amber-500',
              }[STATUS_META[h.toStatus]?.tone] ?? 'bg-brand-500',
            )}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-800">{ACTION_META[h.action] ?? h.action}</span>
            <StatusBadge status={h.toStatus} />
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {dateTime(h.createdAt)} · {h.changedBy?.name}
            {h.changedBy?.role && ` (${ROLE_LABEL[h.changedBy.role]})`}
          </div>
          {h.note && (
            <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{h.note}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
