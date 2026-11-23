import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api, downloadFile, errorMessage } from '../../lib/api';
import { date, money } from '../../lib/format';
import { useSchedule } from '../../hooks/queries';
import { Alert, Badge, Button, ErrorState, PageLoader } from '../ui';

const TONE = { PAID: 'green', OVERDUE: 'red', PENDING: 'slate' };

export function ExportButtons({ app }) {
  return (
    <div className="flex gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => downloadFile(`/applications/${app.id}/export?format=pdf`, `${app.ref}-summary.pdf`)}
      >
        Export PDF
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => downloadFile(`/applications/${app.id}/export?format=csv`, `${app.ref}-summary.csv`)}
      >
        Export CSV
      </Button>
    </div>
  );
}

export function RepaymentSchedule({ app, canMark }) {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useSchedule(app.id, app.status === 'APPROVED');
  const mark = useMutation({
    mutationFn: ({ no, status }) => api.patch(`/applications/${app.id}/schedule/${no}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['application', app.id, 'schedule'] }),
  });

  if (isLoading) return <PageLoader label="Loading schedule…" />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  const { summary } = data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Monthly EMI', money(summary.emi)],
          ['Total interest', money(summary.totalInterest)],
          ['Total payable', money(summary.totalPayable)],
          ['Paid', `${summary.paidCount} / ${data.data.length}`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-slate-50 p-3">
            <div className="text-xs text-slate-500">{k}</div>
            <div className="font-semibold">{v}</div>
          </div>
        ))}
      </div>
      {mark.error && <Alert>{errorMessage(mark.error)}</Alert>}
      <div className="max-h-[480px] overflow-auto rounded-lg border border-slate-200">
        <table className="table w-full min-w-[640px]">
          <thead className="sticky top-0">
            <tr>
              <th>#</th>
              <th>Due date</th>
              <th className="!text-right">EMI</th>
              <th className="!text-right">Principal</th>
              <th className="!text-right">Interest</th>
              <th className="!text-right">Balance</th>
              <th>Status</th>
              {canMark && <th />}
            </tr>
          </thead>
          <tbody>
            {data.data.map((i) => (
              <tr key={i.installmentNo} className={clsx(i.isPastDue && i.status === 'PENDING' && 'bg-amber-50/60')}>
                <td className="text-slate-500">{i.installmentNo}</td>
                <td>{date(i.dueDate)}</td>
                <td className="text-right font-medium">{money(i.emiAmount)}</td>
                <td className="text-right">{money(i.principal)}</td>
                <td className="text-right">{money(i.interest)}</td>
                <td className="text-right">{money(i.balance)}</td>
                <td>
                  <Badge tone={TONE[i.status]}>{i.status.toLowerCase()}</Badge>
                  {i.isPastDue && i.status === 'PENDING' && (
                    <span className="ml-1 text-xs text-amber-700">past due</span>
                  )}
                </td>
                {canMark && (
                  <td className="whitespace-nowrap text-right">
                    <select
                      aria-label={`Status of EMI ${i.installmentNo}`}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                      value={i.status}
                      disabled={mark.isPending}
                      onChange={(e) => mark.mutate({ no: i.installmentNo, status: e.target.value })}
                    >
                      <option value="PENDING">Pending</option>
                      <option value="PAID">Paid</option>
                      <option value="OVERDUE">Overdue</option>
                    </select>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
