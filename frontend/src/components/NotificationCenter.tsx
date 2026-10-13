import React, { useCallback, useEffect, useState } from 'react';
import { BellRing, CheckCircle2, XCircle, Undo2, X } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { formatMoney } from '../utils/format';
import { showSystemNotification } from '../utils/notify';
import { sound } from '../utils/sound';

interface Toast {
  id: number;
  jobId: string;
  title: string;
  body: string;
  tone: 'offer' | 'good' | 'bad';
}

let nextId = 1;

/**
 * Private, per-user alerts (new offers, hired, declined, worker backed out, job cancelled).
 * In-app toasts while the tab is visible, system notifications while it is in the background.
 */
export const NotificationCenter: React.FC<{
  onOpenJob: (jobId: string) => void;
  openJobId?: string | null;
  currentView?: string;
}> = ({ onOpenJob, openJobId, currentView }) => {
  const { socket } = useSocket();
  const { user } = useAuth();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextId++;
      setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
      window.setTimeout(() => dismiss(id), 8000);
      if (toast.tone === 'bad') sound.playTap();
      else sound.playChime();
      showSystemNotification(toast.title, toast.body, () => onOpenJob(toast.jobId));
    },
    [dismiss, onOpenJob]
  );

  useEffect(() => {
    if (!socket || !user) return;

    const onOfferNew = (d: { jobId: string; jobTitle?: string; updated?: boolean; offer: { price: string; worker: { name: string } } }) => {
      // Already looking at this job's offers (unless the tab is in the background)
      if (d.jobId === openJobId && !document.hidden) {
        sound.playChime();
        return;
      }
      push({
        jobId: d.jobId,
        tone: 'offer',
        title: d.updated ? 'Offer updated' : 'New offer',
        body: `${d.offer.worker.name} ${d.updated ? 'now offers' : 'offers'} ${formatMoney(d.offer.price)} for "${d.jobTitle ?? 'your job'}"`,
      });
    };
    const onHired = (d: { jobId: string; jobTitle?: string }) =>
      push({ jobId: d.jobId, tone: 'good', title: "You're hired!", body: `The customer chose you for "${d.jobTitle ?? 'a job'}". Open it to see the address and contact.` });
    const onOfferUpdated = (d: { jobId: string; jobTitle?: string; status: string; reason?: string }) => {
      if (d.status === 'declined') {
        push({ jobId: d.jobId, tone: 'bad', title: 'Offer declined', body: `Your offer for "${d.jobTitle ?? 'a job'}" was declined.` });
      } else if (d.status === 'not_selected') {
        push({
          jobId: d.jobId,
          tone: 'bad',
          title: d.reason === 'job_cancelled' ? 'Job cancelled' : d.reason === 'job_expired' ? 'Request expired' : 'Another worker was chosen',
          body: `"${d.jobTitle ?? 'A job'}" is no longer available.`,
        });
      } else if (d.status === 'pending') {
        push({ jobId: d.jobId, tone: 'offer', title: 'Job open again', body: `"${d.jobTitle ?? 'A job'}" reopened and your offer is active again.` });
      }
    };
    const onReleased = (d: { jobId: string; jobTitle?: string; workerName?: string; reason?: string | null; restoredOffers?: number }) =>
      push({
        jobId: d.jobId,
        tone: 'bad',
        title: `${d.workerName ?? 'Your worker'} can't make it`,
        body: `${d.reason ? `"${d.reason}". ` : ''}"${d.jobTitle ?? 'Your job'}" is open again${d.restoredOffers ? ` with ${d.restoredOffers} earlier offer${d.restoredOffers === 1 ? '' : 's'}` : ''}.`,
      });
    const onCancelled = (d: { jobId: string; jobTitle?: string; reason?: string | null }) =>
      push({ jobId: d.jobId, tone: 'bad', title: 'Job cancelled', body: `The customer cancelled "${d.jobTitle ?? 'the job'}"${d.reason ? `: ${d.reason}` : ''}.` });

    const onProgress = (d: { jobId: string; jobTitle?: string; step: string; workerName?: string }) => {
      if (d.jobId === openJobId && !document.hidden) return; // already watching this job
      const titles: Record<string, string> = {
        en_route: `${d.workerName ?? 'Your worker'} is on the way`,
        arrived: `${d.workerName ?? 'Your worker'} has arrived`,
        completed: 'Job completed',
      };
      push({
        jobId: d.jobId,
        tone: 'good',
        title: titles[d.step] ?? 'Job update',
        body: d.step === 'completed' ? `"${d.jobTitle ?? 'Your job'}" is done. Leave a rating.` : `"${d.jobTitle ?? 'Your job'}"`,
      });
    };
    const onExpired = (d: { jobId: string; jobTitle?: string }) =>
      push({
        jobId: d.jobId,
        tone: 'bad',
        title: 'Request expired',
        body: `"${d.jobTitle ?? 'Your job'}" expired without a hire. Post it again, perhaps with a higher price.`,
      });

    const onNearby = (d: { jobId: string; jobTitle?: string; categoryName?: string; budget?: string | null; distanceKm?: number }) => {
      if (currentView === 'feed' && !document.hidden) return; // the live feed already shows it
      const km = d.distanceKm ?? null;
      push({
        jobId: d.jobId,
        tone: 'offer',
        title: `New job near you${d.budget ? ` · ${formatMoney(d.budget)}` : ''}`,
        body: `${d.categoryName ? `${d.categoryName}: ` : ''}"${d.jobTitle ?? 'New job'}"${km !== null ? `, ${km < 1 ? 'under 1 km' : `${km} km`} away` : ''}`,
      });
    };

    socket.on('offer:new', onOfferNew);
    socket.on('job:nearby', onNearby);
    socket.on('job:progress', onProgress);
    socket.on('job:expired', onExpired);
    socket.on('offer:accepted', onHired);
    socket.on('offer:updated', onOfferUpdated);
    socket.on('job:released', onReleased);
    socket.on('job:cancelled', onCancelled);
    return () => {
      socket.off('offer:new', onOfferNew);
      socket.off('job:nearby', onNearby);
      socket.off('job:progress', onProgress);
      socket.off('job:expired', onExpired);
      socket.off('offer:accepted', onHired);
      socket.off('offer:updated', onOfferUpdated);
      socket.off('job:released', onReleased);
      socket.off('job:cancelled', onCancelled);
    };
  }, [socket, user, push, openJobId, currentView]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed z-[80] top-20 right-3 left-3 sm:left-auto sm:w-96 space-y-2" aria-live="polite">
      {toasts.map((t) => {
        const Icon = t.tone === 'good' ? CheckCircle2 : t.tone === 'bad' ? (t.title.includes("can't") ? Undo2 : XCircle) : BellRing;
        return (
          <div
            key={t.id}
            className={`p-3.5 rounded-2xl border shadow-2xl backdrop-blur-xl flex gap-3 ${
              t.tone === 'good'
                ? 'bg-emerald-950/95 border-emerald-500/50'
                : t.tone === 'bad'
                ? 'bg-slate-900/95 border-slate-700'
                : 'bg-slate-900/95 border-amber-400/50'
            }`}
          >
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${t.tone === 'good' ? 'text-emerald-400' : t.tone === 'bad' ? 'text-slate-400' : 'text-amber-300'}`} />
            <button
              className="flex-1 text-left"
              onClick={() => {
                dismiss(t.id);
                onOpenJob(t.jobId);
              }}
            >
              <p className="text-sm font-black text-white">{t.title}</p>
              <p className="text-xs text-slate-300 mt-0.5">{t.body}</p>
              <p className="text-[11px] font-bold text-emerald-400 mt-1">Open job →</p>
            </button>
            <button onClick={() => dismiss(t.id)} className="p-1 h-fit rounded-lg text-slate-500 hover:text-white" aria-label="Dismiss">
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
