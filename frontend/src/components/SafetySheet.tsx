import React, { useEffect, useState } from 'react';
import { X, Siren, Share2, Flag, ShieldCheck, Check } from 'lucide-react';
import { Job } from '../types/marketplace';
import { getAppConfig } from '../utils/config';
import { formatSchedule } from '../utils/format';
import { Portal } from './Portal';

interface SafetySheetProps {
  job: Job;
  viewerIsPoster: boolean;
  onReport: () => void;
  onClose: () => void;
}

const statusText = (job: Job): string => {
  if (job.status === 'in_progress') return 'work in progress';
  if (job.status === 'completed') return 'completed';
  if (job.status === 'cancelled') return 'cancelled';
  if (job.arrived_at) return 'worker has arrived';
  if (job.en_route_at) return 'worker is on the way';
  return 'worker hired';
};

/**
 * Safety tools during a job: call emergency services, share the job details with someone
 * you trust, or report the other person.
 */
export const SafetySheet: React.FC<SafetySheetProps> = ({ job, viewerIsPoster, onReport, onClose }) => {
  const [emergencyNumber, setEmergencyNumber] = useState('112');
  const [shared, setShared] = useState<'idle' | 'copied' | 'shared'>('idle');
  const other = viewerIsPoster ? job.worker : job.poster;

  useEffect(() => {
    getAppConfig().then((c) => setEmergencyNumber(c.emergencyNumber));
  }, []);

  const shareDetails = async () => {
    const lines = [
      `I'm on a Plugy job: "${job.title}"`,
      `Where: ${job.location_text}`,
      `When: ${formatSchedule(job.scheduled_for)}`,
      other
        ? `${viewerIsPoster ? 'Worker' : 'Customer'}: ${other.name}${other.phone ? ` (${other.phone})` : ''}, rated ${Number(other.rating_avg).toFixed(1)} from ${other.rating_count} reviews`
        : '',
      `Status: ${statusText(job)} (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
    ].filter(Boolean);
    const text = lines.join('\n');

    try {
      if (navigator.share) {
        await navigator.share({ title: 'My Plugy job', text });
        setShared('shared');
        return;
      }
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setShared('copied');
    } catch {
      window.prompt('Copy these details and send them to someone you trust:', text);
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-950/85 backdrop-blur-md" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="safety-title"
          className="w-full sm:max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 space-y-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <h2 id="safety-title" className="text-base font-black text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" /> Safety
            </h2>
            <button onClick={onClose} className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>

          <a
            href={`tel:${emergencyNumber}`}
            className="w-full p-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-3"
          >
            <Siren className="w-6 h-6 shrink-0" />
            <span>
              <span className="block text-sm font-black">Call emergency services ({emergencyNumber})</span>
              <span className="block text-xs text-rose-100">If you are in danger, call now.</span>
            </span>
          </a>

          <button onClick={shareDetails} className="w-full p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-left flex items-center gap-3">
            {shared === 'idle' ? <Share2 className="w-5 h-5 text-sky-400 shrink-0" /> : <Check className="w-5 h-5 text-emerald-400 shrink-0" />}
            <span>
              <span className="block text-sm font-bold text-white">
                {shared === 'copied' ? 'Details copied: paste them in a message' : shared === 'shared' ? 'Details shared' : 'Share job details with someone you trust'}
              </span>
              <span className="block text-xs text-slate-400">Who, where and when, plus the current status.</span>
            </span>
          </button>

          {other && (
            <button
              onClick={onReport}
              className="w-full p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-rose-800/50 text-left flex items-center gap-3"
            >
              <Flag className="w-5 h-5 text-rose-400 shrink-0" />
              <span>
                <span className="block text-sm font-bold text-white">Report {other.name}</span>
                <span className="block text-xs text-slate-400">Our team reviews every report.</span>
              </span>
            </button>
          )}
        </div>
      </div>
    </Portal>
  );
};
