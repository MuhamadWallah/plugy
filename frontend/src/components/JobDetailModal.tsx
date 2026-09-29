import React, { useEffect, useState } from 'react';
import { 
  X, 
  MapPin, 
  DollarSign, 
  Clock, 
  Star, 
  CheckCircle2, 
  Sparkles,
  RefreshCw,
  MessageSquare,
  FileText,
  UserCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { ChatPanel } from './ChatPanel';
import { RatingPrompt } from './RatingPrompt';

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

  // Only participants (poster or worker) can access chat once the job is accepted
  const isPoster = !!user && !!job && user.id === job.poster_id;
  const isWorker = !!user && !!job && job.worker_id !== null && user.id === job.worker_id;
  const isParticipant = isPoster || isWorker;
  const isAccepted = !!job && job.status !== 'open';
  const showChat = isAccepted && isParticipant;

  // Rating state helpers
  const myRating = job?.ratings?.find((r) => r.rater_id === user?.id);
  const otherPartyRating = job?.ratings?.find((r) => r.rater_id !== user?.id);
  const isCompleted = job?.status === 'completed';
  const shouldPromptRating = isCompleted && isParticipant && !myRating;
  const otherPartyName = isPoster ? (job?.worker?.name || 'Worker') : (job?.poster.name || 'Poster');

  const handleRatingSuccess = (rating: { score: number; comment: string | null }) => {
    if (!job || !user) return;
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return { label: 'Open', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
      case 'accepted':
        return { label: 'Accepted', color: 'bg-sky-500/10 text-sky-400 border-sky-500/20' };
      case 'in_progress':
        return { label: 'In Progress', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
      case 'completed':
        return { label: 'Completed', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' };
      case 'cancelled':
        return { label: 'Cancelled', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' };
      default:
        return { label: status, color: 'bg-slate-800 text-slate-300 border-slate-700' };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className={`bg-slate-900 border border-slate-800 rounded-3xl w-full shadow-2xl relative overflow-hidden flex flex-col max-h-[92vh] ${
          showChat ? 'max-w-4xl' : 'max-w-lg'
        }`}
      >
        {/* Modal Top Bar */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/60 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <span className="font-extrabold text-white text-base tracking-tight flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              Plugy Job Overview
            </span>

            {job && (
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border ${getStatusBadge(job.status).color}`}>
                <CheckCircle2 className="w-3 h-3" />
                {getStatusBadge(job.status).label}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Mobile Tab Toggle for Jobs with Chat */}
            {showChat && (
              <div className="flex md:hidden bg-slate-950 p-1 rounded-xl border border-slate-800 mr-2">
                <button
                  onClick={() => setMobileTab('details')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${
                    mobileTab === 'details'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Details</span>
                </button>
                <button
                  onClick={() => setMobileTab('chat')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${
                    mobileTab === 'chat'
                      ? 'bg-emerald-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Chat</span>
                </button>
              </div>
            )}

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              title="Close Modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body Container */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
              <span className="text-xs text-slate-400">Loading job details from server...</span>
            </div>
          ) : error || !job ? (
            <div className="py-10 text-center space-y-3">
              <div className="text-rose-400 text-sm font-semibold">{error || 'Job not found'}</div>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-semibold"
              >
                Close
              </button>
            </div>
          ) : (
            <div className={showChat ? 'grid grid-cols-1 md:grid-cols-12 gap-6' : 'space-y-6'}>
              {/* LEFT COLUMN: Job Details & Ratings */}
              <div 
                className={`${
                  showChat 
                    ? `md:col-span-6 space-y-5 ${mobileTab === 'details' ? 'block' : 'hidden md:block'}` 
                    : 'space-y-6'
                }`}
              >
                {/* POST-COMPLETION RATING PROMPT (If completed & not yet rated) */}
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
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
                    <Sparkles className="w-3.5 h-3.5" />
                    {job.category_name}
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-snug">
                    {job.title}
                  </h2>
                </div>

                {/* Poster & Worker Cards */}
                <div className="space-y-2.5">
                  {/* Poster Card */}
                  <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-slate-950 font-bold flex items-center justify-center text-xs shadow-md">
                        {job.poster.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                          <span>{job.poster.name}</span>
                          {isPoster && (
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                          <span className="font-bold text-slate-200">{Number(job.poster.rating_avg).toFixed(1)}</span>
                          <span>({job.poster.rating_count} reviews)</span>
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-400 font-semibold">
                      Poster
                    </span>
                  </div>

                  {/* Worker Card (if accepted) */}
                  {job.worker && (
                    <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-600 text-slate-950 font-bold flex items-center justify-center text-xs shadow-md">
                          {job.worker.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                            <span>{job.worker.name}</span>
                            {isWorker && (
                              <span className="text-[10px] font-bold text-sky-400 bg-sky-500/10 px-1.5 py-0.2 rounded border border-sky-500/20">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                            <span className="font-bold text-slate-200">{Number(job.worker.rating_avg).toFixed(1)}</span>
                            <span>({job.worker.rating_count} reviews)</span>
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-sky-400 font-semibold flex items-center gap-1">
                        <UserCheck className="w-3 h-3" />
                        Worker
                      </span>
                    </div>
                  )}
                </div>

                {/* Submitted Ratings & Reviews Display (When completed) */}
                {isCompleted && (myRating || otherPartyRating) && (
                  <div className="space-y-2.5 p-4 rounded-2xl bg-slate-950/70 border border-slate-800">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      Completion Ratings & Feedback
                    </h4>

                    {/* My Rating */}
                    {myRating && (
                      <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-emerald-400">Your Rating for {otherPartyName}:</span>
                          <div className="flex items-center gap-0.5 text-amber-400">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`w-3 h-3 ${s <= myRating.score ? 'fill-amber-400' : 'text-slate-700'}`}
                              />
                            ))}
                            <span className="text-[11px] font-bold text-white ml-1">{myRating.score}.0</span>
                          </div>
                        </div>
                        {myRating.comment && (
                          <p className="text-xs text-slate-300 italic pt-1">&ldquo;{myRating.comment}&rdquo;</p>
                        )}
                      </div>
                    )}

                    {/* Other Party's Rating */}
                    {otherPartyRating && (
                      <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-sky-400">{otherPartyName}&apos;s Review for You:</span>
                          <div className="flex items-center gap-0.5 text-amber-400">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`w-3 h-3 ${s <= otherPartyRating.score ? 'fill-amber-400' : 'text-slate-700'}`}
                              />
                            ))}
                            <span className="text-[11px] font-bold text-white ml-1">{otherPartyRating.score}.0</span>
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
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Job Description</h4>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed bg-slate-950/50 p-4 rounded-2xl border border-slate-800/80 whitespace-pre-wrap">
                    {job.description || 'No additional description provided.'}
                  </p>
                </div>

                {/* Meta Info (Budget, Location) */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                      <DollarSign className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Budget</span>
                      <span className="font-bold text-white text-xs sm:text-sm">
                        {job.budget !== null ? `$${Number(job.budget).toFixed(2)}` : 'Negotiable'}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Location</span>
                      <span className="font-medium text-slate-200 truncate block text-xs">
                        {job.location_text}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer Timestamps */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Posted {new Date(job.created_at).toLocaleString()}</span>
                  </div>
                  <span className="font-mono text-[10px]">ID: {job.id.slice(0, 8)}</span>
                </div>
              </div>

              {/* RIGHT COLUMN: Interactive Chat Panel */}
              {showChat && (
                <div 
                  className={`md:col-span-6 flex flex-col h-[480px] md:h-full ${
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
