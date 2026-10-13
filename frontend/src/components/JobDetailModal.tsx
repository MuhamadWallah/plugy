import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X,
  MapPin,
  DollarSign,
  Clock,
  Star,
  Sparkles,
  RefreshCw,
  MessageSquare,
  FileText,
  Check,
  Phone,
  Navigation,
  Flag,
  Play,
  CheckCircle2,
  XCircle,
  Car,
  Home,
  AlertCircle,
  ShieldCheck,
  Undo2,
  Send,
  Lock,
  CalendarClock,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useJobRoom } from '../hooks/useJobRoom';
import { useLiveLocationSharing } from '../hooks/useLiveLocationSharing';
import { Job, JobRating, MyOfferSummary } from '../types/marketplace';
import { formatEta, formatMoney, formatSchedule, paymentLabel, readApiError, relativeTime } from '../utils/format';
import { directionsUrl } from '../utils/geo';
import { ChatPanel } from './ChatPanel';
import { RatingPrompt } from './RatingPrompt';
import { MapView, MapMarker, MapCircle } from './MapView';
import { OffersPanel } from './OffersPanel';
import { OfferModal } from './OfferModal';
import { ProfileModal } from './ProfileModal';
import { ReportDialog } from './ReportDialog';
import { SafetySheet } from './SafetySheet';
import { sound } from '../utils/sound';
import { Portal } from './Portal';

export type { JobRating };
export type JobDetail = Job;

interface JobDetailModalProps {
  jobId: string;
  onClose: () => void;
  onRequireAuth?: () => void;
  /** Open on the chat tab (phones), e.g. from a message notification */
  initialTab?: 'details' | 'chat';
}

const CANCEL_REASONS = ['Found someone else', 'No longer needed', 'Worker is not responding', 'Plans changed'];
const RELEASE_REASONS = ["Can't make it in time", 'Emergency came up', 'Job differs from the description', 'Customer not responding'];

const STEPS = ['Posted', 'Hired', 'On the way', 'Arrived', 'Working', 'Done'];

const stepIndex = (job: Job): number => {
  switch (job.status) {
    case 'open':
      return 0;
    case 'accepted':
      return job.arrived_at ? 3 : job.en_route_at ? 2 : 1;
    case 'in_progress':
      return 4;
    case 'completed':
      return 5;
    default:
      return 0;
  }
};

/** Reason picker used for cancelling (poster) and backing out (worker) */
const ReasonDialog: React.FC<{
  title: string;
  description: string;
  reasons: string[];
  confirmLabel: string;
  busy: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}> = ({ title, description, reasons, confirmLabel, busy, onConfirm, onClose }) => {
  const [choice, setChoice] = useState<string>('');
  const [other, setOther] = useState('');
  const reason = choice === 'other' ? other.trim() : choice;
  return (
    <Portal>
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-950/85 backdrop-blur-md" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full sm:max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-base font-black text-white">{title}</h3>
          <p className="text-xs text-slate-400 mt-1">{description}</p>
        </div>
        <div className="space-y-2">
          {[...reasons, 'other'].map((r) => (
            <button
              key={r}
              onClick={() => setChoice(r)}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl border text-sm font-semibold ${
                choice === r ? 'bg-rose-500/15 border-rose-500/50 text-rose-100' : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}
            >
              {r === 'other' ? 'Other reason' : r}
            </button>
          ))}
          {choice === 'other' && (
            <input
              autoFocus
              maxLength={300}
              value={other}
              onChange={(e) => setOther(e.target.value)}
              placeholder="Tell them briefly why"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white outline-none focus:border-rose-500"
            />
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl bg-slate-800 text-slate-200 text-sm font-bold">
            Go back
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={busy || !reason}
            className="flex-1 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-black disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
};

const PersonCard: React.FC<{
  role: 'Customer' | 'Worker';
  person: NonNullable<Job['worker']>;
  isYou: boolean;
  onViewProfile: () => void;
}> = ({ role, person, isYou, onViewProfile }) => (
  <button
    onClick={onViewProfile}
    className="w-full p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 flex items-center justify-between text-left"
  >
    <div className="flex items-center gap-3 min-w-0">
      <div
        className={`w-9 h-9 shrink-0 rounded-xl text-slate-950 font-black flex items-center justify-center text-xs ${
          role === 'Customer' ? 'bg-gradient-to-br from-emerald-400 to-teal-600' : 'bg-gradient-to-br from-sky-400 to-indigo-600'
        }`}
      >
        {person.name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0">
        <div className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
          <span className="truncate">{person.name}</span>
          {isYou && <span className="text-[10px] text-emerald-400 font-bold">(You)</span>}
          {person.phone_verified && <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-label="Phone verified" />}
        </div>
        <div className="text-[10px] text-slate-400 flex items-center gap-1">
          <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
          <span className="font-bold text-slate-200">{Number(person.rating_avg).toFixed(1)}</span>
          <span>({person.rating_count})</span>
        </div>
      </div>
    </div>
    <span className="text-[10px] uppercase font-bold text-slate-400">{role}</span>
  </button>
);

export const JobDetailModal: React.FC<JobDetailModalProps> = ({ jobId, onClose, onRequireAuth, initialTab = 'details' }) => {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: 'success' | 'error' | 'info' } | null>(null);
  const [mobileTab, setMobileTab] = useState<'details' | 'chat'>(initialTab);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [reasonDialog, setReasonDialog] = useState<'cancel' | 'release' | null>(null);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [workerLocation, setWorkerLocation] = useState<{ lat: number; lng: number; at: string } | null>(null);

  const fetchJob = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { credentials: 'include' });
        if (!res.ok) throw new Error(res.status === 404 ? 'This job no longer exists' : 'Failed to load job details');
        const data = await res.json();
        setJob(data.job);
        setError(null);
      } catch (err) {
        if (!silent) setError(err instanceof Error ? err.message : 'Error fetching job');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [jobId]
  );

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  const isPoster = !!user && !!job && user.id === job.poster_id;
  const isWorker = !!user && !!job && !!job.worker_id && user.id === job.worker_id;
  const isParticipant = isPoster || isWorker;
  const isHired = !!job?.worker_id && job.status !== 'open';
  const showChat = isParticipant && isHired;

  // Private job room: chat, status changes, live worker location
  useJobRoom(jobId, isParticipant && isHired);

  // Hired worker shares GPS while travelling to the job
  const sharingActive = isWorker && job?.status === 'accepted' && !!job?.en_route_at && !job?.arrived_at;
  const liveSharing = useLiveLocationSharing(jobId, sharingActive);

  // Realtime updates for this job
  useEffect(() => {
    if (!socket) return;
    const refreshIfMine = (data: { jobId?: string }) => {
      if (data?.jobId === jobId) fetchJob(true);
    };
    const onLocation = (data: { jobId: string; lat: number; lng: number; at: string }) => {
      if (data.jobId === jobId) setWorkerLocation({ lat: data.lat, lng: data.lng, at: data.at });
    };
    const onReconnect = () => fetchJob(true);

    const events = ['job:status_updated', 'job:rated', 'job:updated', 'job:reopened', 'offer:accepted', 'offer:updated', 'job:released', 'job:cancelled'];
    events.forEach((e) => socket.on(e, refreshIfMine));
    socket.on('job:location', onLocation);
    socket.on('connect', onReconnect);
    return () => {
      events.forEach((e) => socket.off(e, refreshIfMine));
      socket.off('job:location', onLocation);
      socket.off('connect', onReconnect);
    };
  }, [socket, jobId, fetchJob]);

  const flash = (text: string, tone: 'success' | 'error' | 'info' = 'success') => {
    setNotice({ text, tone });
    window.setTimeout(() => setNotice((n) => (n?.text === text ? null : n)), 5000);
  };

  const runAction = async (key: string, path: string, body: Record<string, unknown> | undefined, successText: string) => {
    setBusyAction(key);
    try {
      const res = await fetch(`/api/jobs/${jobId}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) throw new Error(await readApiError(res, 'Action failed'));
      sound.playChime();
      flash(successText);
      await fetchJob(true);
      return true;
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Action failed', 'error');
      return false;
    } finally {
      setBusyAction(null);
    }
  };

  // Ratings
  const myRating = job?.ratings?.find((r) => r.rater_id === user?.id);
  const otherPartyRating = job?.ratings?.find((r) => r.rater_id !== user?.id);
  const isCompleted = job?.status === 'completed';
  const shouldPromptRating = isCompleted && isParticipant && !myRating;
  const otherPartyName = isPoster ? job?.worker?.name || 'Worker' : job?.poster.name || 'Customer';
  const otherParty = isPoster ? job?.worker : job?.poster;

  const handleRatingSuccess = () => {
    sound.playSuccess();
    fetchJob(true);
  };

  // Map content depends on who is looking
  const map = useMemo(() => {
    if (!job || job.latitude === null || job.longitude === null) return null;
    const markers: MapMarker[] = [];
    const circles: MapCircle[] = [];
    const jobPos = { lat: job.latitude, lng: job.longitude };

    if (job.location_precision === 'exact') {
      markers.push({ id: 'job', ...jobPos, kind: 'pin', label: isWorker ? 'Job' : 'Your place', title: 'Job location' });
    } else {
      circles.push({ center: jobPos, radiusMeters: 900, tone: 'approx' });
      markers.push({ id: 'job', ...jobPos, kind: 'job', label: 'Approx. area', title: 'Approximate area' });
    }

    if (isPoster && workerLocation && job.status === 'accepted') {
      markers.push({ id: 'worker', lat: workerLocation.lat, lng: workerLocation.lng, kind: 'worker', label: job.worker?.name ?? 'Worker' });
    }
    if (isWorker && liveSharing.position) {
      markers.push({ id: 'me', lat: liveSharing.position.lat, lng: liveSharing.position.lng, kind: 'me', label: 'You' });
    }
    return { markers, circles, center: jobPos };
  }, [job, isPoster, isWorker, workerLocation, liveSharing.position]);

  const currentStep = job ? stepIndex(job) : 0;
  const price = job?.agreed_price ?? job?.budget ?? null;

  const statusHeadline = (() => {
    if (!job) return null;
    if (job.status === 'cancelled') return { icon: XCircle, tone: 'text-slate-300', text: 'This job was cancelled.' };
    if (job.status === 'completed') return { icon: CheckCircle2, tone: 'text-emerald-300', text: 'Job completed.' };
    if (job.status === 'in_progress') return { icon: Play, tone: 'text-purple-300', text: isWorker ? 'You are working on this job.' : `${job.worker?.name} is working on the job.` };
    if (job.status === 'accepted') {
      if (job.arrived_at) return { icon: Home, tone: 'text-sky-300', text: isWorker ? 'You have arrived.' : `${job.worker?.name} has arrived.` };
      if (job.en_route_at) return { icon: Car, tone: 'text-sky-300', text: isWorker ? 'You are on the way.' : `${job.worker?.name} is on the way.` };
      return { icon: Check, tone: 'text-emerald-300', text: isWorker ? 'You were hired for this job.' : `You hired ${job.worker?.name}.` };
    }
    return null;
  })();

  const handleOfferSaved = (offer: MyOfferSummary | null, message: string) => {
    setOfferModalOpen(false);
    setJob((prev) => (prev ? { ...prev, my_offer: offer } : prev));
    flash(message, 'success');
  };

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-6 bg-slate-950/85 backdrop-blur-md">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={job?.title ?? 'Job details'}
        className={`bg-slate-900 border border-slate-800 sm:rounded-3xl w-full h-full sm:h-auto shadow-2xl relative overflow-hidden flex flex-col sm:max-h-[94vh] ${
          showChat ? 'sm:max-w-6xl' : 'sm:max-w-3xl'
        }`}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/95 z-10">
          <span className="font-black text-white text-sm sm:text-base tracking-tight flex items-center gap-2 truncate">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="truncate">{job?.title ?? 'Job details'}</span>
          </span>

          <div className="flex items-center gap-2 shrink-0">
            {showChat && (
              <div className="flex md:hidden bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setMobileTab('details')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${mobileTab === 'details' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}
                >
                  <FileText className="w-3.5 h-3.5" /> Job
                </button>
                <button
                  onClick={() => setMobileTab('chat')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 ${mobileTab === 'chat' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400'}`}
                >
                  <MessageSquare className="w-3.5 h-3.5" /> Chat
                </button>
              </div>
            )}
            <button
              onClick={() => {
                sound.playTap();
                onClose();
              }}
              className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress */}
        {job && job.status !== 'cancelled' && (
          <ol className="px-4 sm:px-6 py-2.5 bg-slate-950/70 border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto scrollbar-none">
            {STEPS.map((label, idx) => {
              const done = idx < currentStep || (idx === currentStep && job.status === 'completed');
              const current = idx === currentStep && job.status !== 'completed';
              return (
                <li key={label} className="flex items-center gap-2 shrink-0">
                  <span
                    className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black ${
                      done
                        ? 'bg-emerald-500 text-slate-950'
                        : current
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-900 border border-slate-800 text-slate-500'
                    }`}
                  >
                    {done ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : idx + 1}
                  </span>
                  <span className={`text-xs font-bold ${current ? 'text-white' : done ? 'text-emerald-400' : 'text-slate-500'}`}>{label}</span>
                  {idx < STEPS.length - 1 && <span className={`h-0.5 w-5 rounded-full ${done ? 'bg-emerald-500' : 'bg-slate-800'}`} />}
                </li>
              );
            })}
          </ol>
        )}

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
              <span className="text-xs text-slate-400">Loading job…</span>
            </div>
          ) : error || !job ? (
            <div className="py-12 text-center space-y-3">
              <div className="text-rose-400 text-sm font-semibold">{error || 'Job not found'}</div>
              <button onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-semibold">
                Close
              </button>
            </div>
          ) : (
            <div className={showChat ? 'grid grid-cols-1 md:grid-cols-12 gap-6' : 'space-y-5 max-w-2xl mx-auto'}>
              <div className={showChat ? `md:col-span-6 space-y-5 ${mobileTab === 'details' ? 'block' : 'hidden md:block'}` : 'space-y-5'}>
                {notice && (
                  <div
                    role="status"
                    className={`p-3 rounded-2xl text-xs font-semibold flex gap-2 border ${
                      notice.tone === 'error'
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                    }`}
                  >
                    {notice.tone === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
                    {notice.text}
                  </div>
                )}

                {shouldPromptRating && (
                  <RatingPrompt jobId={job.id} rateeName={otherPartyName} rateeRole={isPoster ? 'worker' : 'poster'} onRatingSuccess={handleRatingSuccess} />
                )}

                {/* Title, price, status */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
                      <Sparkles className="w-3.5 h-3.5" /> {job.category_name}
                    </span>
                    <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight break-words">{job.title}</h2>
                    <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Posted {relativeTime(job.created_at)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-black text-white">{formatMoney(price) ?? 'Open to offers'}</div>
                    <div className="text-[10px] uppercase font-bold text-slate-400">
                      {job.agreed_price ? 'Agreed price' : job.budget !== null ? "Customer's price" : 'Workers propose'}
                    </div>
                  </div>
                </div>

                {statusHeadline && (
                  <div className={`p-3 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center gap-2 text-sm font-bold ${statusHeadline.tone}`}>
                    <statusHeadline.icon className="w-4 h-4 shrink-0" />
                    {statusHeadline.text}
                  </div>
                )}

                {job.status === 'cancelled' && isParticipant && job.cancel_reason && (
                  <p className="text-xs text-slate-400 -mt-2">Reason: {job.cancel_reason}</p>
                )}

                {/* POSTER, OPEN: incoming offers */}
                {isPoster && job.status === 'open' && (
                  <OffersPanel
                    job={job}
                    onHired={(hiredJob) => {
                      setJob(hiredJob);
                      flash(`You hired ${hiredJob.worker?.name}. You can now call or chat with them.`);
                      fetchJob(true);
                    }}
                    onBudgetChanged={(updated) => {
                      setJob(updated);
                      flash(`Price raised to ${formatMoney(updated.budget)}. Nearby workers see the new price.`);
                    }}
                  />
                )}

                {/* WORKER (or visitor), OPEN: make / manage an offer */}
                {!isPoster && job.status === 'open' && (
                  <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
                    {job.my_offer && job.my_offer.status !== 'withdrawn' ? (
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] uppercase font-bold text-slate-400">Your offer</p>
                          <p className="text-lg font-black text-white">{formatMoney(job.my_offer.price)}</p>
                          <p
                            className={`text-xs font-bold ${
                              job.my_offer.status === 'pending' ? 'text-amber-300' : job.my_offer.status === 'declined' ? 'text-rose-300' : 'text-slate-400'
                            }`}
                          >
                            {job.my_offer.status === 'pending'
                              ? 'Waiting for the customer to choose'
                              : job.my_offer.status === 'declined'
                              ? 'Declined by the customer'
                              : 'The customer chose another worker'}
                            {job.my_offer.eta_minutes !== null && job.my_offer.status === 'pending' && ` · ${formatEta(job.my_offer.eta_minutes)}`}
                          </p>
                        </div>
                        {job.my_offer.status === 'pending' && (
                          <button
                            onClick={() => setOfferModalOpen(true)}
                            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold"
                          >
                            Change offer
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <p className="text-sm text-slate-300">
                          {job.budget !== null
                            ? `Accept ${formatMoney(job.budget)} or offer your own price.`
                            : 'The customer wants to hear your price.'}
                        </p>
                        <button
                          onClick={() => {
                            if (!user) {
                              onRequireAuth?.();
                              return;
                            }
                            setOfferModalOpen(true);
                          }}
                          className="px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-black flex items-center justify-center gap-2"
                        >
                          <Send className="w-4 h-4" />
                          {user ? 'Make an offer' : 'Sign in to make an offer'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* HIRED: contact + actions */}
                {isParticipant && isHired && otherParty && (
                  <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-black uppercase tracking-wider text-slate-400">
                        {isPoster ? 'Your worker' : 'Your customer'}
                      </p>
                      {job.status !== 'cancelled' && (
                        <button
                          onClick={() => setSafetyOpen(true)}
                          className="px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/30 text-[11px] font-bold text-rose-200 hover:bg-rose-500/20 flex items-center gap-1"
                        >
                          <Flag className="w-3 h-3" /> Safety
                        </button>
                      )}
                    </div>
                    <PersonCard role={isPoster ? 'Worker' : 'Customer'} person={otherParty} isYou={false} onViewProfile={() => setProfileId(otherParty.id)} />

                    {['accepted', 'in_progress'].includes(job.status) && (
                      <div className="grid grid-cols-2 gap-2">
                        {otherParty.phone ? (
                          <a
                            href={`tel:${otherParty.phone}`}
                            className="py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5"
                          >
                            <Phone className="w-4 h-4" /> Call {otherParty.phone}
                          </a>
                        ) : (
                          <span className="py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-500 text-[11px] font-semibold flex items-center justify-center text-center px-2">
                            No phone on file. Use chat.
                          </span>
                        )}
                        <button
                          onClick={() => setMobileTab('chat')}
                          className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 md:cursor-default"
                        >
                          <MessageSquare className="w-4 h-4" /> Chat
                        </button>
                      </div>
                    )}

                    {/* Worker actions */}
                    {isWorker && job.status === 'accepted' && (
                      <div className="space-y-2">
                        {job.latitude !== null && job.longitude !== null && (
                          <a
                            href={directionsUrl({ lat: job.latitude, lng: job.longitude })}
                            target="_blank"
                            rel="noreferrer"
                            className="w-full py-2.5 rounded-xl bg-sky-500/15 border border-sky-500/40 text-sky-200 text-xs font-bold flex items-center justify-center gap-1.5"
                          >
                            <Navigation className="w-4 h-4" /> Navigate to the job
                          </a>
                        )}
                        {!job.en_route_at && (
                          <button
                            onClick={() => runAction('en-route', 'en-route', undefined, 'Customer notified that you are on the way. Your live location is shared while this screen is open.')}
                            disabled={!!busyAction}
                            className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            <Car className="w-4 h-4" /> I'm on my way
                          </button>
                        )}
                        {job.en_route_at && !job.arrived_at && (
                          <button
                            onClick={() => runAction('arrived', 'arrived', undefined, 'Customer notified that you have arrived.')}
                            disabled={!!busyAction}
                            className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            <Home className="w-4 h-4" /> I've arrived
                          </button>
                        )}
                        <button
                          onClick={() => runAction('start', 'start', undefined, 'Job started.')}
                          disabled={!!busyAction}
                          className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          <Play className="w-4 h-4" /> Start the job
                        </button>
                        {sharingActive && (
                          <p className={`text-[11px] ${liveSharing.error ? 'text-amber-300' : 'text-sky-300'}`}>
                            {liveSharing.error ?? 'Sharing your live location with the customer while this screen is open.'}
                          </p>
                        )}
                        <button
                          onClick={() => setReasonDialog('release')}
                          className="w-full py-2 text-xs font-semibold text-slate-400 hover:text-rose-300 flex items-center justify-center gap-1"
                        >
                          <Undo2 className="w-3.5 h-3.5" /> I can't do this job
                        </button>
                      </div>
                    )}

                    {/* Complete (either party) */}
                    {['accepted', 'in_progress'].includes(job.status) && (isWorker ? job.status === 'in_progress' : true) && (
                      confirmComplete ? (
                        <div className="flex gap-2">
                          <button onClick={() => setConfirmComplete(false)} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-200 text-sm font-bold">
                            Not yet
                          </button>
                          <button
                            onClick={async () => {
                              setConfirmComplete(false);
                              await runAction('complete', 'complete', undefined, 'Job completed. Please rate your experience.');
                            }}
                            disabled={!!busyAction}
                            className="flex-1 py-3 rounded-xl bg-emerald-500 text-slate-950 text-sm font-black disabled:opacity-50"
                          >
                            Yes, it's done
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmComplete(true)}
                          className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-black flex items-center justify-center gap-2"
                        >
                          <CheckCircle2 className="w-4 h-4" /> Mark job as done
                        </button>
                      )
                    )}
                  </div>
                )}

                {/* Map */}
                {map ? (
                  <div className="space-y-2">
                    <MapView markers={map.markers} circles={map.circles} center={map.center} zoom={14} fitToMarkers className="h-56 sm:h-64" />
                    <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      {job.location_precision === 'exact' ? (
                        <>
                          <Lock className="w-3 h-3" /> Exact location: only you and {isPoster ? (job.worker ? 'your worker' : 'the worker you hire') : 'the customer'} can see it.
                        </>
                      ) : (
                        <>
                          <MapPin className="w-3 h-3" /> Approximate area. The exact address is shared with the worker who gets hired.
                        </>
                      )}
                      {isPoster && workerLocation && job.status === 'accepted' && <span> · Worker location updated {relativeTime(workerLocation.at)}</span>}
                    </p>
                  </div>
                ) : null}

                {/* Description & location */}
                <div>
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1.5">Details</h4>
                  <p className="text-sm text-slate-300 leading-relaxed bg-slate-950/60 p-4 rounded-2xl border border-slate-800 whitespace-pre-wrap">
                    {job.description || 'No additional details provided.'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center gap-3">
                    <CalendarClock className="w-5 h-5 text-sky-400 shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">When</span>
                      <span className="font-bold text-white text-sm">{formatSchedule(job.scheduled_for)}</span>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center gap-3">
                    <Wallet className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">Payment</span>
                      <span className="font-bold text-white text-sm">{paymentLabel(job.payment_method)}</span>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center gap-3">
                    <DollarSign className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">Price</span>
                      <span className="font-black text-white text-sm">{formatMoney(price) ?? 'Open to offers'}</span>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center gap-3 min-w-0">
                    <MapPin className="w-5 h-5 text-sky-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">Area</span>
                      <span className="font-semibold text-slate-200 truncate block">{job.location_text}</span>
                    </div>
                  </div>
                </div>

                {/* People */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <PersonCard role="Customer" person={job.poster} isYou={isPoster} onViewProfile={() => setProfileId(job.poster.id)} />
                  {job.worker ? (
                    <PersonCard role="Worker" person={job.worker} isYou={isWorker} onViewProfile={() => setProfileId(job.worker!.id)} />
                  ) : (
                    <div className="p-3.5 rounded-2xl bg-slate-950/40 border border-dashed border-slate-800 flex items-center justify-center text-xs text-amber-400 font-semibold">
                      No worker hired yet
                    </div>
                  )}
                </div>

                {/* Feedback */}
                {isCompleted && (myRating || otherPartyRating) && (
                  <div className="space-y-2.5 p-4 rounded-2xl bg-slate-950/80 border border-slate-800">
                    <h4 className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /> Feedback
                    </h4>
                    {[myRating && { r: myRating, label: `Your rating for ${otherPartyName}` }, otherPartyRating && { r: otherPartyRating, label: `${otherPartyName}'s rating for you` }]
                      .filter((x): x is { r: JobRating; label: string } => !!x)
                      .map(({ r, label }) => (
                        <div key={r.id} className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-200">{label}</span>
                            <span className="flex items-center gap-0.5">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <Star key={s} className={`w-3 h-3 ${s <= r.score ? 'text-amber-400 fill-amber-400' : 'text-slate-700'}`} />
                              ))}
                            </span>
                          </div>
                          {r.comment && <p className="text-xs text-slate-300 italic">&ldquo;{r.comment}&rdquo;</p>}
                        </div>
                      ))}
                  </div>
                )}

                {/* Poster: cancel */}
                {isPoster && ['open', 'accepted'].includes(job.status) && (
                  <button
                    onClick={() => setReasonDialog('cancel')}
                    className="w-full py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-rose-300 hover:border-rose-800/40 text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Cancel this job
                  </button>
                )}
              </div>

              {showChat && (
                <div className={`md:col-span-6 flex flex-col h-[calc(100vh-11rem)] md:h-[600px] ${mobileTab === 'chat' ? 'flex' : 'hidden md:flex'}`}>
                  <ChatPanel
                    jobId={job.id}
                    posterId={job.poster_id}
                    workerId={job.worker_id}
                    posterName={job.poster.name}
                    workerName={job.worker?.name}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {offerModalOpen && job && (
        <OfferModal job={job} existingOffer={job.my_offer} onClose={() => setOfferModalOpen(false)} onSaved={handleOfferSaved} />
      )}
      {profileId && <ProfileModal userId={profileId} onClose={() => setProfileId(null)} />}
      {safetyOpen && job && (
        <SafetySheet
          job={job}
          viewerIsPoster={isPoster}
          onClose={() => setSafetyOpen(false)}
          onReport={() => {
            setSafetyOpen(false);
            setReportOpen(true);
          }}
        />
      )}
      {reportOpen && otherParty && (
        <ReportDialog userId={otherParty.id} userName={otherParty.name} jobId={job?.id} onClose={() => setReportOpen(false)} />
      )}
      {reasonDialog === 'cancel' && (
        <ReasonDialog
          title="Cancel this job?"
          description={job?.worker ? `${job.worker.name} will be notified.` : 'Workers who made offers will be notified.'}
          reasons={CANCEL_REASONS}
          confirmLabel="Cancel job"
          busy={busyAction === 'cancel'}
          onClose={() => setReasonDialog(null)}
          onConfirm={async (reason) => {
            const ok = await runAction('cancel', 'cancel', { reason }, 'Job cancelled.');
            if (ok) setReasonDialog(null);
          }}
        />
      )}
      {reasonDialog === 'release' && (
        <ReasonDialog
          title="Can't do this job?"
          description="The customer is notified and the job reopens so they can choose another worker."
          reasons={RELEASE_REASONS}
          confirmLabel="Withdraw from job"
          busy={busyAction === 'release'}
          onClose={() => setReasonDialog(null)}
          onConfirm={async (reason) => {
            const ok = await runAction('release', 'release', { reason }, 'You have withdrawn from this job.');
            if (ok) setReasonDialog(null);
          }}
        />
      )}
    </div>
    </Portal>
  );
};
