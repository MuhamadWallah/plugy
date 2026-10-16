import React, { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { formatMoney, paymentLabel, relativeTime } from '../utils/format';

interface Earnings {
  this_week: string;
  this_month: string;
  all_time: string;
  jobs_completed: number;
}

interface RecentJob {
  id: string;
  title: string;
  agreed_price: string | null;
  completed_at: string;
  payment_method: string;
  category_name: string;
  customer_name: string;
}

/** Worker earnings from completed jobs (shown once they've completed at least one) */
export const EarningsCard: React.FC<{ onOpenJob?: (jobId: string) => void }> = ({ onOpenJob }) => {
  const [data, setData] = useState<{ earnings: Earnings; recent: RecentJob[] } | null>(null);

  useEffect(() => {
    fetch('/api/workers/me/earnings', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data || data.earnings.jobs_completed === 0) return null;
  const { earnings, recent } = data;

  return (
    <section className="p-5 sm:p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-4" aria-labelledby="earnings-heading">
      <h2 id="earnings-heading" className="text-sm font-black text-white flex items-center gap-2">
        <Wallet className="w-4 h-4 text-emerald-400" /> Your earnings
      </h2>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ['This week', earnings.this_week],
          ['This month', earnings.this_month],
          ['All time', earnings.all_time],
        ].map(([label, value]) => (
          <div key={label} className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
            <div className="text-base sm:text-lg font-black text-white">{formatMoney(value)}</div>
            <div className="text-[10px] uppercase font-bold text-slate-400">{label}</div>
          </div>
        ))}
      </div>
      <ul className="divide-y divide-slate-800">
        {recent.map((job) => (
          <li key={job.id}>
            <button onClick={() => onOpenJob?.(job.id)} className="w-full py-2.5 flex items-center justify-between gap-3 text-left">
              <span className="min-w-0">
                <span className="block text-sm font-bold text-white truncate">{job.title}</span>
                <span className="block text-[11px] text-slate-500">
                  {job.customer_name} · {paymentLabel(job.payment_method)} · {relativeTime(job.completed_at)}
                </span>
              </span>
              <span className="text-sm font-black text-emerald-300 shrink-0">{formatMoney(job.agreed_price) ?? '—'}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-slate-500">
        {earnings.jobs_completed} completed job{earnings.jobs_completed === 1 ? '' : 's'}. Amounts are the agreed prices, paid to you directly by customers.
      </p>
    </section>
  );
};
