import React, { useEffect, useState, useCallback } from 'react';
import { 
  Sparkles, 
  MapPin, 
  DollarSign, 
  Clock, 
  Play, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  RefreshCw, 
  Briefcase, 
  HandMetal, 
  Layers, 
  PlusCircle, 
  ShieldAlert,
  MessageSquare,
  Star
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

export interface MyJob {
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
  status: 'open' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  updated_at: string;
  is_poster: boolean;
  is_worker: boolean;
  has_rated?: boolean;
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

interface MyJobsProps {
  onSelectJob: (jobId: string) => void;
  onNavigateToPostJob: () => void;
  onNavigateToFeed: () => void;
}

export const MyJobs: React.FC<MyJobsProps> = ({ 
  onSelectJob, 
  onNavigateToPostJob,
  onNavigateToFeed 
}) => {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [jobs, setJobs] = useState<MyJob[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterRole, setFilterRole] = useState<'all' | 'posted' | 'accepted'>('all');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Confirmation Modal state
  const [confirmModal, setConfirmModal] = useState<{
    jobId: string;
    action: 'complete' | 'cancel';
    title: string;
  } | null>(null);

  const fetchMyJobs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch('/api/jobs/mine', {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
      }
    } catch (err) {
      console.error('Failed to fetch personal jobs:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchMyJobs();
  }, [fetchMyJobs]);

  // Real-time updates for job lifecycle status changes
  useEffect(() => {
    if (!socket) return;

    const handleStatusUpdated = ({ jobId, status, job }: { jobId: string; status: string; job: MyJob }) => {
      setJobs((prev) => {
        return prev.map((j) => {
          if (j.id === jobId) {
            return {
              ...j,
              ...job,
              status: status as MyJob['status'],
            };
          }
          return j;
        });
      });
    };

    const handleJobAccepted = ({ jobId, job }: { jobId: string; job: MyJob }) => {
      setJobs((prev) => {
        // If current user is poster or worker, update it
        return prev.map((j) => {
          if (j.id === jobId) {
            return { ...j, ...job, status: 'accepted' };
          }
          return j;
        });
      });
    };

    socket.on('job:status_updated', handleStatusUpdated);
    socket.on('job:accepted', handleJobAccepted);

    return () => {
      socket.off('job:status_updated', handleStatusUpdated);
      socket.off('job:accepted', handleJobAccepted);
    };
  }, [socket]);

  // Actions
  const handleStartJob = async (jobId: string) => {
    setActionLoadingId(jobId);
    try {
      const res = await fetch(`/api/jobs/${jobId}/start`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        setToastMessage({ text: 'Job started! Status is now in_progress.', type: 'success' });
        fetchMyJobs();
      } else {
        setToastMessage({ text: data.error || 'Failed to start job', type: 'error' });
      }
    } catch {
      setToastMessage({ text: 'Network error', type: 'error' });
    } finally {
      setActionLoadingId(null);
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  const handleExecuteConfirmedAction = async () => {
    if (!confirmModal) return;
    const { jobId, action } = confirmModal;
    setActionLoadingId(jobId);
    setConfirmModal(null);

    try {
      const endpoint = action === 'complete' ? `/api/jobs/${jobId}/complete` : `/api/jobs/${jobId}/cancel`;
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        setToastMessage({ 
          text: action === 'complete' ? 'Job marked as completed! Please rate your experience.' : 'Job cancelled.', 
          type: 'success' 
        });
        fetchMyJobs();
        if (action === 'complete') {
          onSelectJob(jobId);
        }
      } else {
        setToastMessage({ text: data.error || `Failed to ${action} job`, type: 'error' });
      }
    } catch {
      setToastMessage({ text: 'Network error', type: 'error' });
    } finally {
      setActionLoadingId(null);
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  const filteredJobs = jobs.filter((job) => {
    if (filterRole === 'posted') return job.is_poster;
    if (filterRole === 'accepted') return job.is_worker;
    return true;
  });

  const getStatusBadge = (status: MyJob['status']) => {
    switch (status) {
      case 'open':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
            Open
          </span>
        );
      case 'accepted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
            Accepted
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-300 border border-purple-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping"></span>
            In Progress
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            Completed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700">
            <XCircle className="w-3 h-3 text-slate-400" />
            Cancelled
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">My Jobs</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage jobs you have posted as a customer or picked up as a local worker.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchMyJobs()}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            title="Refresh Jobs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          <button
            onClick={onNavigateToPostJob}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 transition cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5 stroke-[2.5]" />
            Post a Job
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between shadow-lg border animate-in slide-in-from-top-2 duration-150 ${
          toastMessage.type === 'success'
            ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
            : 'bg-rose-950/80 border-rose-500/40 text-rose-200'
        }`}>
          <div className="flex items-center gap-2">
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-white text-xs cursor-pointer ml-3">✕</button>
        </div>
      )}

      {/* Role Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setFilterRole('all')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
            filterRole === 'all'
              ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
              : 'text-slate-400 hover:text-white bg-slate-900/60 border border-slate-800'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          All ({jobs.length})
        </button>

        <button
          onClick={() => setFilterRole('posted')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
            filterRole === 'posted'
              ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
              : 'text-slate-400 hover:text-white bg-slate-900/60 border border-slate-800'
          }`}
        >
          <Briefcase className="w-3.5 h-3.5" />
          Posted by Me ({jobs.filter((j) => j.is_poster).length})
        </button>

        <button
          onClick={() => setFilterRole('accepted')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
            filterRole === 'accepted'
              ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
              : 'text-slate-400 hover:text-white bg-slate-900/60 border border-slate-800'
          }`}
        >
          <HandMetal className="w-3.5 h-3.5" />
          Accepted by Me ({jobs.filter((j) => j.is_worker).length})
        </button>
      </div>

      {/* Jobs List */}
      {loading ? (
        <div className="py-16 text-center space-y-3">
          <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-slate-400">Loading your jobs...</p>
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-slate-900/40 border border-slate-800/80 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
            <Briefcase className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">No jobs found in this section</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Post a service task to request help, or browse the live job board to accept an open task.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={onNavigateToPostJob}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5 stroke-[2.5]" />
              Post a Job
            </button>
            <button
              onClick={onNavigateToFeed}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs border border-slate-800 transition cursor-pointer"
            >
              Browse Open Jobs
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredJobs.map((job) => {
            const isActing = actionLoadingId === job.id;

            return (
              <div
                key={job.id}
                onClick={() => onSelectJob(job.id)}
                className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/90 hover:border-slate-700 transition flex flex-col md:flex-row md:items-center justify-between gap-5 cursor-pointer shadow-lg group"
              >
                {/* Left Section: Details */}
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {getStatusBadge(job.status)}

                    <span className="text-[11px] font-semibold text-emerald-400 capitalize flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      {job.category_name}
                    </span>

                    <span className="text-slate-600">&bull;</span>

                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md ${
                      job.is_poster 
                        ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' 
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}>
                      {job.is_poster ? 'You: Poster' : 'You: Worker'}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-white group-hover:text-emerald-300 transition-colors">
                    {job.title}
                  </h3>

                  <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-500" />
                      {job.location_text}
                    </span>

                    <span className="flex items-center gap-1 font-semibold text-white">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                      {job.budget !== null ? `$${Number(job.budget).toFixed(2)}` : 'Negotiable'}
                    </span>

                    <span className="flex items-center gap-1 text-slate-500">
                      <Clock className="w-3.5 h-3.5" />
                      Updated {new Date(job.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Counterparty Information */}
                  <div className="text-xs text-slate-400 pt-1">
                    {job.is_poster ? (
                      job.worker ? (
                        <span>Assigned Worker: <strong className="text-slate-200">{job.worker.name}</strong> (★ {Number(job.worker.rating_avg).toFixed(1)} &bull; {job.worker.rating_count} reviews)</span>
                      ) : (
                        <span className="text-amber-400/90 italic">Waiting for a worker to accept...</span>
                      )
                    ) : (
                      <span>Poster: <strong className="text-slate-200">{job.poster.name}</strong> (★ {Number(job.poster.rating_avg).toFixed(1)} &bull; {job.poster.rating_count} reviews)</span>
                    )}
                  </div>
                </div>

                {/* Right Section: Role-Guarded Actions */}
                <div 
                  className="flex items-center gap-2 shrink-0 self-end md:self-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Direct Chat Button (for accepted, in_progress, completed jobs) */}
                  {job.status !== 'open' && (
                    <button
                      onClick={() => onSelectJob(job.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950/80 hover:bg-slate-800 text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 hover:border-emerald-500/40 font-semibold text-xs transition cursor-pointer shadow-sm"
                      title="Open Direct Job Chat"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Chat</span>
                    </button>
                  )}

                  {/* WORKER ACTIONS */}
                  {job.is_worker && (
                    <>
                      {/* Worker: Start Job when accepted */}
                      {job.status === 'accepted' && (
                        <button
                          onClick={() => handleStartJob(job.id)}
                          disabled={isActing}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md shadow-purple-600/20 transition cursor-pointer disabled:opacity-50"
                        >
                          <Play className="w-3.5 h-3.5 fill-white stroke-[2]" />
                          Start Job
                        </button>
                      )}

                      {/* Worker: Complete Job when in_progress */}
                      {job.status === 'in_progress' && (
                        <button
                          onClick={() => setConfirmModal({ jobId: job.id, action: 'complete', title: job.title })}
                          disabled={isActing}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 transition cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                          Mark Completed
                        </button>
                      )}
                    </>
                  )}

                  {/* POSTER ACTIONS */}
                  {job.is_poster && (
                    <>
                      {/* Poster: Cancel when open or accepted */}
                      {(job.status === 'open' || job.status === 'accepted') && (
                        <button
                          onClick={() => setConfirmModal({ jobId: job.id, action: 'cancel', title: job.title })}
                          disabled={isActing}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-800/40 font-semibold text-xs transition cursor-pointer disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Cancel Job
                        </button>
                      )}

                      {/* Poster: Complete when accepted or in_progress */}
                      {(job.status === 'accepted' || job.status === 'in_progress') && (
                        <button
                          onClick={() => setConfirmModal({ jobId: job.id, action: 'complete', title: job.title })}
                          disabled={isActing}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 transition cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                          Mark Completed
                        </button>
                      )}
                    </>
                  )}

                  {/* Terminal State Indicators */}
                  {job.status === 'completed' && (
                    <>
                      {!job.has_rated ? (
                        <button
                          onClick={() => onSelectJob(job.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-amber-600/20 hover:from-amber-500/30 hover:to-amber-600/30 text-amber-300 border border-amber-500/30 font-bold text-xs transition cursor-pointer shadow-sm"
                          title="Rate this completed job"
                        >
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          <span>Rate {job.is_poster ? 'Worker' : 'Poster'}</span>
                        </button>
                      ) : (
                        <span className="text-xs text-amber-400/90 font-semibold flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          Rated
                        </span>
                      )}
                      <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Finished
                      </span>
                    </>
                  )}

                  {job.status === 'cancelled' && (
                    <span className="text-xs text-slate-500 font-semibold flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
                      <XCircle className="w-3.5 h-3.5" />
                      Closed
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal for Complete or Cancel */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-100">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                confirmModal.action === 'complete' 
                  ? 'bg-emerald-500/20 text-emerald-400' 
                  : 'bg-rose-500/20 text-rose-400'
              }`}>
                {confirmModal.action === 'complete' ? (
                  <CheckCircle2 className="w-6 h-6 stroke-[2.2]" />
                ) : (
                  <AlertTriangle className="w-6 h-6 stroke-[2.2]" />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {confirmModal.action === 'complete' ? 'Confirm Job Completion' : 'Cancel This Job?'}
                </h3>
                <p className="text-xs text-slate-400">
                  {confirmModal.action === 'complete'
                    ? 'Once completed, the job status is locked and cannot be changed.'
                    : 'Cancelling this job will remove it from open listings.'}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 font-medium truncate">
              "{confirmModal.title}"
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Go Back
              </button>
              <button
                onClick={handleExecuteConfirmedAction}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  confirmModal.action === 'complete'
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/20'
                }`}
              >
                {confirmModal.action === 'complete' ? 'Yes, Mark Completed' : 'Yes, Cancel Job'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
