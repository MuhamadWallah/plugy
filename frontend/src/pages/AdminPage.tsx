import React, { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, RefreshCw, Ban, CheckCircle2, AlertCircle, UserCheck, Star, Flag } from 'lucide-react';
import { readApiError, relativeTime } from '../utils/format';

interface AdminReport {
  id: string;
  reason: string;
  details: string | null;
  status: 'open' | 'resolved';
  created_at: string;
  resolution: 'dismissed' | 'suspended' | null;
  resolution_note: string | null;
  resolved_at: string | null;
  reporter: { id: string; name: string; email: string };
  reported_user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    suspended_at: string | null;
    rating_avg: string | number;
    rating_count: number;
    open_reports: number;
    total_reports: number;
  };
  job: { id: string; title: string; status: string } | null;
}

const REASON_LABELS: Record<string, string> = {
  no_show: "Didn't show up",
  unsafe_behavior: 'Unsafe behaviour',
  harassment: 'Harassment or abuse',
  fraud_or_scam: 'Fraud or scam',
  poor_quality: 'Poor quality / damage',
  other: 'Something else',
};

/**
 * Moderation queue for accounts listed in ADMIN_EMAILS.
 */
export const AdminPage: React.FC<{ onOpenJob: (jobId: string) => void }> = ({ onOpenJob }) => {
  const [status, setStatus] = useState<'open' | 'resolved'>('open');
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [suspending, setSuspending] = useState<{ id: string; note: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reports?status=${status}`, { credentials: 'include' });
      if (!res.ok) throw new Error(await readApiError(res, 'Could not load reports'));
      const data = await res.json();
      setReports(data.reports);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load reports');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (path: string, body: Record<string, unknown>, id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readApiError(res, 'Action failed'));
      const data = await res.json();
      setNotice(
        data.message === 'User suspended'
          ? `User suspended. ${data.cancelledJobs} open job(s) cancelled, ${data.withdrawnOffers} offer(s) withdrawn.`
          : data.message
      );
      setSuspending(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto w-full space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-black text-white flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-rose-400" /> Safety reports
        </h1>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800" role="group" aria-label="Report status">
            {(['open', 'resolved'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                aria-pressed={status === s}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${status === s ? 'bg-emerald-500 text-slate-950' : 'text-slate-400'}`}
              >
                {s}
              </button>
            ))}
          </div>
          <button onClick={load} className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white" aria-label="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {notice && (
        <div role="status" className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-sm flex gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> {notice}
        </div>
      )}
      {error && (
        <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {!loading && reports.length === 0 && (
        <p className="p-10 text-center text-sm text-slate-400 rounded-3xl bg-slate-900/40 border border-slate-800">
          {status === 'open' ? 'No open reports. All clear.' : 'No resolved reports yet.'}
        </p>
      )}

      <ul className="space-y-3">
        {reports.map((r) => {
          const u = r.reported_user;
          return (
            <li key={r.id} className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-black text-white flex items-center gap-2">
                    <Flag className="w-4 h-4 text-rose-400" /> {REASON_LABELS[r.reason] ?? r.reason}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Reported {relativeTime(r.created_at)} by {r.reporter.name} ({r.reporter.email})
                  </p>
                </div>
                {r.status === 'resolved' && (
                  <span className={`text-[11px] font-black uppercase px-2.5 py-1 rounded-full ${r.resolution === 'suspended' ? 'bg-rose-500/15 text-rose-300' : 'bg-slate-800 text-slate-300'}`}>
                    {r.resolution}
                  </span>
                )}
              </div>

              {r.details && <p className="text-sm text-slate-200 bg-slate-950/70 border border-slate-800 rounded-2xl p-3">&ldquo;{r.details}&rdquo;</p>}

              <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-white flex items-center gap-2">
                    {u.name}
                    {u.suspended_at && <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300">Suspended</span>}
                  </p>
                  <p className="text-slate-400">{u.email}{u.phone ? ` · ${u.phone}` : ''}</p>
                </div>
                <div className="text-right">
                  <p className="flex items-center gap-1 justify-end">
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" /> {Number(u.rating_avg).toFixed(1)} ({u.rating_count})
                  </p>
                  <p className={u.open_reports > 1 ? 'text-rose-300 font-bold' : 'text-slate-400'}>
                    {u.open_reports} open / {u.total_reports} total reports
                  </p>
                </div>
              </div>

              {r.job && (
                <button onClick={() => onOpenJob(r.job!.id)} className="text-xs text-emerald-400 hover:underline">
                  Job: {r.job.title} ({r.job.status.replace('_', ' ')}) →
                </button>
              )}
              {r.resolution_note && <p className="text-xs text-slate-400">Note: {r.resolution_note}</p>}

              {r.status === 'open' && (
                suspending?.id === r.id ? (
                  <div className="space-y-2">
                    <input
                      autoFocus
                      maxLength={300}
                      value={suspending.note}
                      onChange={(e) => setSuspending({ id: r.id, note: e.target.value })}
                      placeholder="Reason for suspension (kept on record)"
                      aria-label="Reason for suspension"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white outline-none focus:border-rose-500"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => setSuspending(null)} className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold">
                        Cancel
                      </button>
                      <button
                        onClick={() => act(`/api/admin/reports/${r.id}/resolve`, { action: 'suspend', note: suspending.note || null }, r.id)}
                        disabled={busyId === r.id}
                        className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black disabled:opacity-50"
                      >
                        Confirm suspension
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => act(`/api/admin/reports/${r.id}/resolve`, { action: 'dismiss' }, r.id)}
                      disabled={busyId === r.id}
                      className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold disabled:opacity-50"
                    >
                      Dismiss
                    </button>
                    <button
                      onClick={() => setSuspending({ id: r.id, note: '' })}
                      className="flex-1 py-2 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white text-xs font-black flex items-center justify-center gap-1.5"
                    >
                      <Ban className="w-3.5 h-3.5" /> Suspend {u.name}
                    </button>
                  </div>
                )
              )}

              {u.suspended_at && r.status === 'resolved' && (
                <button
                  onClick={() => act(`/api/admin/users/${u.id}/unsuspend`, {}, r.id)}
                  disabled={busyId === r.id}
                  className="text-xs text-sky-300 hover:underline flex items-center gap-1 disabled:opacity-50"
                >
                  <UserCheck className="w-3.5 h-3.5" /> Reinstate {u.name}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
