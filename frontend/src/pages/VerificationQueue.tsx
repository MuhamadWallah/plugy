import React, { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, XCircle, RefreshCw, AlertCircle, CheckCircle2, Star } from 'lucide-react';
import { readApiError, relativeTime } from '../utils/format';

interface Submission {
  id: string;
  document_type: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    phone_verified: boolean;
    member_since: string;
    rating_avg: string | number;
    rating_count: number;
    jobs_completed: number;
  };
}

const DOC_LABELS: Record<string, string> = { national_id: 'National ID', passport: 'Passport', drivers_license: "Driver's licence" };

/** Admin review of identity submissions: compare the ID photo with the selfie, then approve or reject */
export const VerificationQueue: React.FC = () => {
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [items, setItems] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<{ id: string; reason: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/verifications?status=${status}`, { credentials: 'include' });
      if (!res.ok) throw new Error(await readApiError(res, 'Could not load ID checks'));
      setItems((await res.json()).verifications);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load ID checks');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (id: string, decision: 'approve' | 'reject', reason?: string) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/verifications/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ decision, reason: reason || null }),
      });
      if (!res.ok) throw new Error(await readApiError(res, 'Could not save the review'));
      setNotice((await res.json()).message);
      setRejecting(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the review');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800" role="group" aria-label="Submission status">
          {(['pending', 'approved', 'rejected'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              aria-pressed={status === s}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${status === s ? 'bg-sky-500 text-slate-950' : 'text-slate-400'}`}
            >
              {s}
            </button>
          ))}
        </div>
        <button onClick={load} className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white" aria-label="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
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
      {!loading && items.length === 0 && (
        <p className="p-10 text-center text-sm text-slate-400 rounded-3xl bg-slate-900/40 border border-slate-800">
          {status === 'pending' ? 'No ID checks waiting.' : `No ${status} submissions.`}
        </p>
      )}

      <ul className="space-y-3">
        {items.map((v) => (
          <li key={v.id} className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-black text-white">{v.user.name}</p>
                <p className="text-xs text-slate-400">
                  {v.user.email}
                  {v.user.phone ? ` · ${v.user.phone}${v.user.phone_verified ? ' (verified)' : ''}` : ''}
                </p>
                <p className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                  <span className="flex items-center gap-0.5"><Star className="w-3 h-3 text-amber-400 fill-amber-400" /> {Number(v.user.rating_avg).toFixed(1)} ({v.user.rating_count})</span>
                  <span>· {v.user.jobs_completed} jobs done</span>
                  <span>· submitted {relativeTime(v.created_at)}</span>
                </p>
              </div>
              <span className="text-[11px] font-black uppercase px-2.5 py-1 rounded-full bg-slate-800 text-slate-300">{DOC_LABELS[v.document_type] ?? v.document_type}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {(['document', 'selfie'] as const).map((kind) => (
                <a
                  key={kind}
                  href={`/api/admin/verifications/${v.id}/files/${kind}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-2xl overflow-hidden border border-slate-800 bg-slate-950"
                >
                  <img src={`/api/admin/verifications/${v.id}/files/${kind}`} alt={kind === 'document' ? 'ID document' : 'Selfie'} className="w-full h-48 object-contain" />
                  <span className="block text-center text-[11px] text-slate-400 py-1">{kind === 'document' ? 'ID document' : 'Selfie'} (open full size)</span>
                </a>
              ))}
            </div>

            {v.status === 'rejected' && v.rejection_reason && <p className="text-xs text-slate-400">Reason: {v.rejection_reason}</p>}

            {v.status === 'pending' &&
              (rejecting?.id === v.id ? (
                <div className="space-y-2">
                  <input
                    autoFocus
                    maxLength={300}
                    value={rejecting.reason}
                    onChange={(e) => setRejecting({ id: v.id, reason: e.target.value })}
                    placeholder="Reason shown to the worker, e.g. ID photo is blurry"
                    aria-label="Rejection reason"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white outline-none focus:border-rose-500"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setRejecting(null)} className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold">
                      Cancel
                    </button>
                    <button
                      onClick={() => review(v.id, 'reject', rejecting.reason)}
                      disabled={busyId === v.id || !rejecting.reason.trim()}
                      className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setRejecting({ id: v.id, reason: '' })}
                    className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                  <button
                    onClick={() => review(v.id, 'approve')}
                    disabled={busyId === v.id}
                    className="flex-1 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <BadgeCheck className="w-3.5 h-3.5" /> Approve {v.user.name}
                  </button>
                </div>
              ))}
          </li>
        ))}
      </ul>
    </div>
  );
};
