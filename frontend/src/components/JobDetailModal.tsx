import React, { useEffect, useState } from 'react';
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
  UserCheck,
  Check
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { ChatPanel } from './ChatPanel';
import { RatingPrompt } from './RatingPrompt';
import { sound } from '../utils/sound';

export interface JobRating {
  id: string;
  rater_id: string;
  ratee_id: string;
  score: number;
  comment: string | null;
  created_at: string;
  rater?: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
}

export interface JobDetail {
  id: string;
  poster_id: string;
  worker_id: string | null;
  category_slug: string;
  category_name: string;
  category_icon?: string;
  title: string;
  description: string;
  location_text: string;
  budget: number | null;
  status: string;
  created_at: string;
  accepted_at?: string | null;
  completed_at?: string | null;
  ratings?: JobRating[];
  poster: {
    id: string;
    name: string;
    avatar_url: string | null;
    rating_avg: string | number;
    rating_count: number;
  };
  worker: {
    id: string;
    name: string;
    avatar_url: string | null;
    rating_avg: string | number;
    rating_count: number;
  } | null;
}

interface JobDetailModalProps {
  jobId: string;
  onClose: () => void;
}

export const JobDetailModal: React.FC<JobDetailModalProps> = ({ jobId, onClose }) => {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'details' | 'chat'>('details');

  useEffect(() => {
    const fetchJob = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) {
          throw new Error('Failed to load job details');
        }
        const data = await res.json();
        setJob(data.job);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error fetching job');
      } finally {
        setLoading(false);
      }
    };

    fetchJob();
  }, [jobId]);

  // Listen for realtime status and rating changes for this job
  useEffect(() => {
    if (!socket || !jobId) return;

    const handleStatusUpdate = (data: { jobId: string; status: string; job?: JobDetail }) => {
      if (data.jobId === jobId) {
        setJob((prev) => (prev ? { ...prev, status: data.status, ...(data.job || {}) } : prev));
      }
    };

    const handleRatingUpdate = (data: { jobId: string; rating: JobRating; ratee: { id: string; rating_avg: number; rating_count: number } }) => {
      if (data.jobId === jobId) {
        setJob((prev) => {
          if (!prev) return prev;
          const existingRatings = prev.ratings || [];
          const updatedRatings = existingRatings.some((r) => r.id === data.rating.id)
            ? existingRatings
            : [...existingRatings, data.rating];

          const updatedPoster =
            prev.poster_id === data.ratee.id
              ? { ...prev.poster, rating_avg: data.ratee.rating_avg, rating_count: data.ratee.rating_count }
              : prev.poster;

          const updatedWorker =
            prev.worker && prev.worker_id === data.ratee.id
              ? { ...prev.worker, rating_avg: data.ratee.rating_avg, rating_count: data.ratee.rating_count }
              : prev.worker;

          return {
            ...prev,
            ratings: updatedRatings,
            poster: updatedPoster,
            worker: updatedWorker,
          };
        });
      }
    };

    socket.on('job:status_updated', handleStatusUpdate);
    socket.on('job:rated', handleRatingUpdate);

    return () => {
      socket.off('job:status_updated', handleStatusUpdate);
      socket.off('job:rated', handleRatingUpdate);
    };
  }, [socket, jobId]);

  const isPoster = !!user && !!job && user.id === job.poster_id;
  const isWorker = !!user && !!job && job.worker_id !== null && user.id === job.worker_id;
  const isParticipant = isPoster || isWorker;
  const isAccepted = !!job && job.status !== 'open';
  const showChat = isAccepted && isParticipant;

  const myRating = job?.ratings?.find((r) => r.rater_id === user?.id);
  const otherPartyRating = job?.ratings?.find((r) => r.rater_id !== user?.id);
  const isCompleted = job?.status === 'completed';
  const shouldPromptRating = isCompleted && isParticipant && !myRating;
  const otherPartyName = isPoster ? (job?.worker?.name || 'Worker') : (job?.poster.name || 'Poster');

  const handleRatingSuccess = (rating: { score: number; comment: string | null }) => {
    if (!job || !user) return;
    sound.playSuccess();
    const newRatingItem: JobRating = {
      id: 'local-' + Date.now(),
      rater_id: user.id,
      ratee_id: isPoster ? (job.worker_id || '') : job.poster_id,
      score: rating.score,
      comment: rating.comment,
      created_at: new Date().toISOString(),
      rater: {
        id: user.id,
        name: user.name,
        avatar_url: user.avatar_url || null,
      },
    };

    setJob((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        ratings: [...(prev.ratings || []), newRatingItem],
      };
    });
  };

  const steps = [
    { key: 'open', label: '1. Posted' },
    { key: 'accepted', label: '2. Accepted' },
    { key: 'in_progress', label: '3. In Progress' },
    { key: 'completed', label: '4. Completed' },
  ];

  const getStepIndex = (status: string) => {
    switch (status) {
      case 'open': return 0;
      case 'accepted': return 1;
      case 'in_progress': return 2;
      case 'completed': return 3;
      default: return 0;
    }
  };

  const currentStepIdx = job ? getStepIndex(job.status) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
      <div 
        className={`bg-slate-900 border border-slate-800 rounded-3xl w-full shadow-2xl relative overflow-hidden flex flex-col max-h-[92vh] ${
          showChat ? 'max-w-6xl' : 'max-w-3xl'
        }`}
      >
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/90 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <span className="font-black text-white text-base tracking-tight flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              Plugy Job Workspace
            </span>
          </div>

          <div className="flex items-center gap-2">
            {showChat && (
              <div className="flex md:hidden bg-slate-950 p-1 rounded-xl border border-slate-800 mr-2">
                <button
                  onClick={() => setMobileTab('details')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                    mobileTab === 'details' ? 'bg-slate-800 text-white' : 'text-slate-400'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Specs</span>
                </button>
                <button
                  onClick={() => setMobileTab('chat')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                    mobileTab === 'chat' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Chat</span>
                </button>
              </div>
            )}

            <button
              onClick={() => {
                sound.playTap();
                onClose();
              }}
              className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Interactive Lifecycle Stepper (Horizontal) */}
        {job && job.status !== 'cancelled' && (
          <div className="px-6 py-3 bg-slate-950/70 border-b border-slate-800/80 hidden sm:flex items-center justify-between gap-3">
            {steps.map((st, idx) => {
              const isPast = idx < currentStepIdx;
              const isCurrent = idx === currentStepIdx;
              return (
                <div key={st.key} className="flex items-center gap-2 flex-1">
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black transition-all ${
                    isPast
                      ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                      : isCurrent
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 ring-2 ring-emerald-500/20'
                      : 'bg-slate-900 border border-slate-800 text-slate-500'
                  }`}>
                    {isPast ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : idx + 1}
                  </div>
                  <span className={`text-xs font-bold ${isCurrent ? 'text-white' : isPast ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {st.label}
                  </span>
                  {idx < steps.length - 1 && (
                    <div className={`h-0.5 flex-1 rounded-full ${isPast ? 'bg-emerald-500' : 'bg-slate-800'}`} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
              <span className="text-xs text-slate-400">Loading full contract specs...</span>
            </div>
          ) : error || !job ? (
            <div className="py-12 text-center space-y-3">
              <div className="text-rose-400 text-sm font-semibold">{error || 'Job not found'}</div>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          ) : (
            <div className={showChat ? 'grid grid-cols-1 md:grid-cols-12 gap-6' : 'space-y-6 max-w-2xl mx-auto'}>
              {/* LEFT COLUMN: Details & Ratings */}
              <div 
                className={`${
                  showChat 
                    ? `md:col-span-6 space-y-5 ${mobileTab === 'details' ? 'block' : 'hidden md:block'}` 
                    : 'space-y-6'
                }`}
              >
                {/* Rating Prompt */}
                {shouldPromptRating && (
                  <RatingPrompt
                    jobId={job.id}
                    rateeName={otherPartyName}
                    rateeRole={isPoster ? 'worker' : 'poster'}
                    onRatingSuccess={handleRatingSuccess}
                  />
                )}

                {/* Category & Title */}
                <div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
                    <Sparkles className="w-3.5 h-3.5" />
                    {job.category_name}
                  </span>
                  <h2 className="text-2xl font-black text-white tracking-tight">
                    {job.title}
                  </h2>
                </div>

                {/* Counterparty Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Poster */}
                  <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-slate-950 font-black flex items-center justify-center text-xs shadow-md">
                        {job.poster.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span>{job.poster.name}</span>
                          {isPoster && <span className="text-[10px] text-emerald-400 font-bold">(You)</span>}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                          <span className="font-bold text-slate-200">{Number(job.poster.rating_avg).toFixed(1)}</span>
                          <span>({job.poster.rating_count})</span>
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] uppercase font-bold text-slate-400">Poster</span>
                  </div>

                  {/* Worker */}
                  {job.worker ? (
                    <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-600 text-slate-950 font-black flex items-center justify-center text-xs shadow-md">
                          {job.worker.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-1.5">
                            <span>{job.worker.name}</span>
                            {isWorker && <span className="text-[10px] text-sky-400 font-bold">(You)</span>}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                            <span className="font-bold text-slate-200">{Number(job.worker.rating_avg).toFixed(1)}</span>
                            <span>({job.worker.rating_count})</span>
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] uppercase font-bold text-sky-400 flex items-center gap-1">
                        <UserCheck className="w-3 h-3" />
                        Worker
                      </span>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-2xl bg-slate-950/40 border border-dashed border-slate-800 flex items-center justify-center text-xs text-amber-400 font-semibold italic">
                      Waiting for a worker to accept
                    </div>
                  )}
                </div>

                {/* Rating & Feedback Box */}
                {isCompleted && (myRating || otherPartyRating) && (
                  <div className="space-y-2.5 p-4 rounded-2xl bg-slate-950/80 border border-slate-800">
                    <h4 className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      Submitted Feedback
                    </h4>

                    {myRating && (
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-emerald-400">Your Rating for {otherPartyName}:</span>
                          <div className="flex items-center gap-0.5 text-amber-400">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`w-3 h-3 ${s <= myRating.score ? 'fill-amber-400' : 'text-slate-700'}`}
                              />
                            ))}
                            <span className="text-xs font-black text-white ml-1">{myRating.score}.0</span>
                          </div>
                        </div>
                        {myRating.comment && (
                          <p className="text-xs text-slate-300 italic pt-1">&ldquo;{myRating.comment}&rdquo;</p>
                        )}
                      </div>
                    )}

                    {otherPartyRating && (
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-sky-400">{otherPartyName}&apos;s Feedback:</span>
                          <div className="flex items-center gap-0.5 text-amber-400">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`w-3 h-3 ${s <= otherPartyRating.score ? 'fill-amber-400' : 'text-slate-700'}`}
                              />
                            ))}
                            <span className="text-xs font-black text-white ml-1">{otherPartyRating.score}.0</span>
                          </div>
                        </div>
                        {otherPartyRating.comment && (
                          <p className="text-xs text-slate-300 italic pt-1">&ldquo;{otherPartyRating.comment}&rdquo;</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Description */}
                <div>
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1.5">Task Description</h4>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed bg-slate-950/60 p-4 rounded-2xl border border-slate-800 whitespace-pre-wrap">
                    {job.description || 'No additional details provided.'}
                  </p>
                </div>

                {/* Location & Budget Box */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                      <DollarSign className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">Compensation</span>
                      <span className="font-black text-white text-sm">
                        {job.budget !== null ? `$${Number(job.budget).toFixed(2)}` : 'Negotiable'}
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div className="truncate">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">Location</span>
                      <span className="font-semibold text-slate-200 truncate block text-xs">
                        {job.location_text}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer Timestamps */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Published {new Date(job.created_at).toLocaleString()}</span>
                  </div>
                  <span className="font-mono text-[10px]">UUID: {job.id.slice(0, 8)}</span>
                </div>
              </div>

              {/* RIGHT COLUMN: Chat Panel */}
              {showChat && (
                <div 
                  className={`md:col-span-6 flex flex-col h-[520px] md:h-full ${
                    mobileTab === 'chat' ? 'block' : 'hidden md:flex'
                  }`}
                >
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
    </div>
  );
};
