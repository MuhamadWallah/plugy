import React, { useState } from 'react';
import { X, Flag, AlertCircle, CheckCircle2 } from 'lucide-react';
import { readApiError } from '../utils/format';
import { Portal } from './Portal';

const REASONS: { value: string; label: string }[] = [
  { value: 'no_show', label: "Didn't show up" },
  { value: 'unsafe_behavior', label: 'Unsafe behaviour' },
  { value: 'harassment', label: 'Harassment or abuse' },
  { value: 'fraud_or_scam', label: 'Fraud or scam' },
  { value: 'poor_quality', label: 'Poor quality / damage' },
  { value: 'other', label: 'Something else' },
];

interface ReportDialogProps {
  userId: string;
  userName: string;
  jobId?: string;
  onClose: () => void;
}

export const ReportDialog: React.FC<ReportDialogProps> = ({ userId, userName, jobId, onClose }) => {
  const [reason, setReason] = useState<string>('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!reason) {
      setError('Please choose what happened.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${userId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason, details: details.trim() || null, job_id: jobId ?? null }),
      });
      if (!res.ok) throw new Error(await readApiError(res, 'Could not send the report'));
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Portal>
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-950/85 backdrop-blur-md" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        className="w-full sm:max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="report-title" className="text-base font-black text-white flex items-center gap-2">
            <Flag className="w-4 h-4 text-rose-400" /> Report {userName}
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-sm flex gap-2">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              Thanks. Our team will review this report. If you are in danger, contact local emergency services right away.
            </div>
            <button onClick={onClose} className="w-full py-3 rounded-2xl bg-slate-800 text-white text-sm font-bold">Close</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setReason(r.value)}
                  className={`p-2.5 rounded-xl text-xs font-bold border text-left ${
                    reason === r.value ? 'bg-rose-500/20 border-rose-500/60 text-rose-200' : 'bg-slate-950 border-slate-800 text-slate-300'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <textarea
              rows={3}
              maxLength={1000}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="What happened? (optional)"
              className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:border-rose-500 text-sm text-white placeholder-slate-500 outline-none resize-none"
            />
            {error && (
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}
            <button
              onClick={submit}
              disabled={submitting}
              className="w-full py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-black disabled:opacity-50"
            >
              Send report
            </button>
          </>
        )}
      </div>
    </div>
    </Portal>
  );
};
