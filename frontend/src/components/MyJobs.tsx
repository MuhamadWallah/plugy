import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
  Layers, 
  PlusCircle, 
  ShieldAlert,
  MessageSquare,
  Star,
  Search,
  CheckCheck,
  TrendingUp,
  Activity,
  Car,
  Home,
  Hourglass,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Job, OfferStatus } from '../types/marketplace';
import { formatEta, formatMoney, formatSchedule, paymentLabel, relativeTime } from '../utils/format';
import { sound } from '../utils/sound';
import { Portal } from './Portal';

export interface MyJob extends Job {
  is_poster: boolean;
  is_worker: boolean;
  has_rated?: boolean;
}

interface MyOffer {
  id: string;
  job_id: string;
  price: string | number;
  eta_minutes: number | null;
  status: OfferStatus;
  updated_at: string;
  job: {
    id: string;
    title: string;
    status: string;
    budget: string | number | null;
    location_text: string;
    category_name: string;
    poster: { id: string; name: string; rating_avg: string | number; rating_count: number };
  };
}

const priceOf = (job: MyJob) => job.agreed_price ?? job.budget;

interface MyJobsProps {
  onSelectJob: (jobId: string) => void;
  onNavigateToPostJob: () => void;
  onNavigateToFeed: () => void;
}

type RoleFilter = 'all' | 'posted' | 'accepted' | 'offers';
type StatusFilter = 'all' | 'active' | 'completed' | 'cancelled';

export const MyJobs: React.FC<MyJobsProps> = ({ 
  onSelectJob, 
  onNavigateToPostJob,
  onNavigateToFeed 
}) => {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [jobs, setJobs] = useState<MyJob[]>([]);
  const [offers, setOffers] = useState<MyOffer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterRole, setFilterRole] = useState<RoleFilter>('all');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
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
      const [jobsRes, offersRes] = await Promise.all([
        fetch('/api/jobs/mine', { credentials: 'include' }),
        fetch('/api/offers/mine', { credentials: 'include' }),
      ]);
      if (jobsRes.ok) {
        const data = await jobsRes.json();
        setJobs(data.jobs || []);
      }
      if (offersRes.ok) {
        const data = await offersRes.json();
        setOffers(data.offers || []);
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
              status: status as MyJob['status'],
              worker_id: job?.worker_id ?? j.worker_id,
              agreed_price: job?.agreed_price ?? j.agreed_price,
              en_route_at: job?.en_route_at ?? null,
              arrived_at: job?.arrived_at ?? null,
              completed_at: job?.completed_at ?? j.completed_at,
              updated_at: job?.updated_at ?? j.updated_at,
            };
          }
          return j;
        });
      });
    };

    // Hired from another tab/device: reload to get the worker's private details
    const handleJobAccepted = ({ jobId }: { jobId: string }) => {
      setJobs((prev) => {
        if (prev.some((j) => j.id === jobId && j.status === 'open')) fetchMyJobs();
        return prev;
      });
    };

    // Offer activity on my jobs
    const adjustOfferCount = (jobId: string, delta: number) =>
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId && typeof j.offer_count === 'number' ? { ...j, offer_count: Math.max(0, j.offer_count + delta) } : j))
      );
    const handleOfferNew = ({ jobId, updated }: { jobId: string; updated?: boolean }) => {
      if (!updated) adjustOfferCount(jobId, 1);
    };
    const handleOfferWithdrawn = ({ jobId }: { jobId: string }) => adjustOfferCount(jobId, -1);

    socket.on('job:status_updated', handleStatusUpdated);
    socket.on('job:accepted', handleJobAccepted);
    socket.on('offer:new', handleOfferNew);
    socket.on('offer:withdrawn', handleOfferWithdrawn);
    socket.on('offer:accepted', fetchMyJobs);
    socket.on('offer:updated', fetchMyJobs);
    socket.on('job:released', fetchMyJobs);
    socket.on('connect', fetchMyJobs);

    return () => {
      socket.off('job:status_updated', handleStatusUpdated);
      socket.off('job:accepted', handleJobAccepted);
      socket.off('offer:new', handleOfferNew);
      socket.off('offer:withdrawn', handleOfferWithdrawn);
      socket.off('offer:accepted', fetchMyJobs);
      socket.off('offer:updated', fetchMyJobs);
      socket.off('job:released', fetchMyJobs);
      socket.off('connect', fetchMyJobs);
    };
  }, [socket, fetchMyJobs]);

  // Actions
  const handleStartJob = async (jobId: string) => {
    sound.playTap();
    setActionLoadingId(jobId);
    try {
      const res = await fetch(`/api/jobs/${jobId}/start`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        sound.playChime();
        setToastMessage({ text: 'Job started! Status is now In Progress.', type: 'success' });
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
        sound.playSuccess();
        setToastMessage({ 
          text: action === 'complete' ? 'Job completed! Please submit your feedback.' : 'Job cancelled.', 
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

  // Metrics summary
  const metrics = useMemo(() => {
    const total = jobs.length;
    const active = jobs.filter((j) => j.status === 'accepted' || j.status === 'in_progress').length;
    const completed = jobs.filter((j) => j.status === 'completed').length;
    const totalVolume = jobs
      .filter((j) => j.status !== 'cancelled')
      .reduce((sum, j) => sum + (priceOf(j) ? Number(priceOf(j)) : 0), 0);
    return { total, active, completed, totalVolume };
  }, [jobs]);

  // Filtered jobs
  const filteredJobs = useMemo(() => {
    let result = [...jobs];

    if (filterRole === 'posted') result = result.filter((j) => j.is_poster);
    if (filterRole === 'accepted') result = result.filter((j) => j.is_worker);

    if (filterStatus === 'active') {
      result = result.filter((j) => j.status === 'open' || j.status === 'accepted' || j.status === 'in_progress');
    } else if (filterStatus === 'completed') {
      result = result.filter((j) => j.status === 'completed');
    } else if (filterStatus === 'cancelled') {
      result = result.filter((j) => j.status === 'cancelled');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.location_text.toLowerCase().includes(q) ||
          j.poster.name.toLowerCase().includes(q) ||
          (j.worker && j.worker.name.toLowerCase().includes(q))
      );
    }

    return result;
  }, [jobs, filterRole, filterStatus, searchQuery]);

  const getStatusBadge = (job: MyJob) => {
    const status = job.status;
    if (status === 'accepted' && (job.arrived_at || job.en_route_at)) {
      const arrived = !!job.arrived_at;
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-sky-500/10 text-sky-300 border border-sky-500/30">
          {arrived ? <Home className="w-3.5 h-3.5" /> : <Car className="w-3.5 h-3.5" />}
          {arrived ? 'Arrived' : 'On the way'}
        </span>
      );
    }
    switch (status) {
      case 'open':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
            {job.is_poster ? 'Getting offers' : 'Open'}
          </span>
        );
      case 'accepted':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
            Hired
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-purple-500/15 text-purple-300 border border-purple-500/30">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping"></span>
            In Progress
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Completed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700">
            <XCircle className="w-3.5 h-3.5 text-slate-400" />
            Cancelled
          </span>
        );
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`p-4 rounded-3xl text-xs font-bold flex items-center justify-between shadow-2xl border animate-in slide-in-from-top-2 duration-150 ${
          toastMessage.type === 'success'
            ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
            : 'bg-rose-950/90 border-rose-500/50 text-rose-200'
        }`}>
          <div className="flex items-center gap-2.5">
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span className="text-sm">{toastMessage.text}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="p-1 rounded-lg text-slate-400 hover:text-white text-xs cursor-pointer hover:bg-slate-800">✕</button>
        </div>
      )}

      {/* Top 4 Interactive Metrics Cards Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Jobs */}
        <div
          onClick={() => {
            sound.playTap();
            setFilterRole('all');
            setFilterStatus('all');
          }}
          className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition cursor-pointer shadow-lg backdrop-blur-md flex items-center justify-between group"
        >
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
              Total jobs
            </span>
            <div className="text-2xl font-black text-white group-hover:text-emerald-400 transition-colors">
              {metrics.total}
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-400 group-hover:text-emerald-400 group-hover:border-emerald-500/30 transition-all">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        {/* Active In Progress */}
        <div
          onClick={() => {
            sound.playTap();
            setFilterStatus('active');
          }}
          className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 hover:border-purple-500/40 transition cursor-pointer shadow-lg backdrop-blur-md flex items-center justify-between group"
        >
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-400 block mb-1">
              Active / In Progress
            </span>
            <div className="text-2xl font-black text-white group-hover:text-purple-300 transition-colors">
              {metrics.active}
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-105 transition-transform">
            <Activity className="w-6 h-6" />
          </div>
        </div>

        {/* Completed */}
        <div
          onClick={() => {
            sound.playTap();
            setFilterStatus('completed');
          }}
          className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 hover:border-emerald-500/40 transition cursor-pointer shadow-lg backdrop-blur-md flex items-center justify-between group"
        >
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block mb-1">
              Finished & Rated
            </span>
            <div className="text-2xl font-black text-white group-hover:text-emerald-300 transition-colors">
              {metrics.completed}
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
            <CheckCheck className="w-6 h-6" />
          </div>
        </div>

        {/* Total Value */}
        <div className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-lg backdrop-blur-md flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-sky-400 block mb-1">
              Total value
            </span>
            <div className="text-2xl font-black text-white">
              ${metrics.totalVolume.toFixed(2)}
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Control Bar: Search + Role Tabs + Status Pills */}
      <div className="p-4 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl backdrop-blur-md flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search my jobs by title, person, or location..."
            className="w-full pl-10 pr-4 py-2 rounded-2xl bg-slate-950/80 border border-slate-800 focus:border-emerald-500 text-xs text-white placeholder-slate-500 outline-none transition"
          />
        </div>

        {/* Role Tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-slate-950 p-1 rounded-2xl border border-slate-800">
            <button
              onClick={() => {
                sound.playTap();
                setFilterRole('all');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                filterRole === 'all'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({jobs.length})
            </button>
            <button
              onClick={() => {
                sound.playTap();
                setFilterRole('posted');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                filterRole === 'posted'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Posted by Me ({jobs.filter((j) => j.is_poster).length})
            </button>
            <button
              onClick={() => {
                sound.playTap();
                setFilterRole('accepted');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                filterRole === 'accepted'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Hired for ({jobs.filter((j) => j.is_worker).length})
            </button>
            <button
              onClick={() => {
                sound.playTap();
                setFilterRole('offers');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                filterRole === 'offers'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              My offers ({offers.filter((o) => o.status === 'pending').length})
            </button>
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => {
              sound.playTap();
              fetchMyJobs();
            }}
            disabled={loading}
            className="p-2 rounded-2xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* My offers (worker) */}
      {filterRole === 'offers' ? (
        offers.length === 0 ? (
          <div className="p-12 text-center rounded-3xl bg-slate-900/40 border border-slate-800/80 space-y-3 max-w-lg mx-auto">
            <Hourglass className="w-8 h-8 text-slate-500 mx-auto" />
            <h3 className="text-base font-bold text-white">No offers yet</h3>
            <p className="text-xs text-slate-400">Find a job nearby and accept the price or offer your own.</p>
            <button
              onClick={onNavigateToFeed}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs"
            >
              Browse jobs
            </button>
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {offers.map((offer) => (
              <li key={offer.id}>
                <button
                  onClick={() => onSelectJob(offer.job_id)}
                  className="w-full text-left p-5 rounded-3xl bg-slate-900/80 border border-slate-800/80 hover:border-slate-700 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[11px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                        offer.status === 'pending'
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {offer.status === 'pending' ? 'Waiting for customer' : offer.status === 'declined' ? 'Declined' : 'Not selected'}
                    </span>
                    <span className="text-lg font-black text-white">{formatMoney(offer.price)}</span>
                  </div>
                  <h3 className="text-base font-black text-white">{offer.job.title}</h3>
                  <p className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{offer.job.location_text}</span>
                    <span>· {offer.job.poster.name}</span>
                    {offer.eta_minutes !== null && <span>· {formatEta(offer.eta_minutes)}</span>}
                    <span>· {relativeTime(offer.updated_at)}</span>
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : loading ? (
        <div className="py-16 text-center space-y-3">
          <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-slate-400">Loading your jobs…</p>
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="p-16 text-center rounded-3xl bg-slate-900/40 border border-slate-800/80 space-y-4 max-w-lg mx-auto">
          <div className="w-16 h-16 rounded-3xl bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
            <Briefcase className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">No jobs here yet</h3>
            <p className="text-xs text-slate-400 mt-1">
              Post a job and get offers, or find a job nearby and send an offer.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => {
                sound.playTap();
                onNavigateToPostJob();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-md transition cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5 stroke-[2.5]" />
              Post a Job
            </button>
            <button
              onClick={() => {
                sound.playTap();
                onNavigateToFeed();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition cursor-pointer"
            >
              Find jobs nearby
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-5">
          {filteredJobs.map((job) => {
            const isActing = actionLoadingId === job.id;

            return (
              <div
                key={job.id}
                onClick={() => {
                  sound.playTap();
                  onSelectJob(job.id);
                }}
                className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/95 transition-all flex flex-col justify-between gap-5 cursor-pointer shadow-xl group backdrop-blur-sm"
              >
                {/* Top Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(job)}

                      <span className="text-xs font-bold text-emerald-400 capitalize flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        {job.category_name}
                      </span>
                    </div>

                    <span className={`text-[10px] uppercase font-black tracking-wider px-2.5 py-1 rounded-xl border ${
                      job.is_poster 
                        ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' 
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    }`}>
                      {job.is_poster ? 'Role: Poster' : 'Role: Worker'}
                    </span>
                  </div>

                  <h3 className="text-lg font-black text-white group-hover:text-emerald-300 transition-colors">
                    {job.title}
                  </h3>

                  <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-500" />
                      {job.location_text}
                    </span>

                    <span className="flex items-center gap-1 font-bold text-white bg-slate-950 px-2.5 py-0.5 rounded-lg border border-slate-800">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                      {formatMoney(priceOf(job)) ?? 'Open to offers'}
                    </span>

                    <span className="flex items-center gap-1 text-sky-300 text-[11px] font-semibold">
                      {formatSchedule(job.scheduled_for)} · {paymentLabel(job.payment_method)}
                    </span>

                    <span className="flex items-center gap-1 text-slate-500 text-[11px]">
                      <Clock className="w-3 h-3" />
                      Updated {relativeTime(job.updated_at ?? job.created_at)}
                    </span>
                  </div>

                  {/* Counterparty Box */}
                  <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between text-xs">
                    <div>
                      {job.is_poster ? (
                        job.worker ? (
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400">Worker:</span>
                            <strong className="text-white">{job.worker.name}</strong>
                            <div className="flex items-center gap-0.5 text-amber-400 text-[10px]">
                              <Star className="w-2.5 h-2.5 fill-amber-400" />
                              <span>{Number(job.worker.rating_avg).toFixed(1)}</span>
                            </div>
                          </div>
                        ) : (
                          job.status === 'open' ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectJob(job.id);
                              }}
                              className={`flex items-center gap-1.5 font-bold ${job.offer_count ? 'text-emerald-300' : 'text-amber-400 italic'}`}
                            >
                              <Users className="w-3.5 h-3.5" />
                              {job.offer_count
                                ? `${job.offer_count} offer${job.offer_count === 1 ? '' : 's'} waiting · Review`
                                : 'Waiting for offers…'}
                            </button>
                          ) : (
                            <span className="text-slate-500 italic">No worker hired</span>
                          )
                        )
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">Poster:</span>
                          <strong className="text-white">{job.poster.name}</strong>
                          <div className="flex items-center gap-0.5 text-amber-400 text-[10px]">
                            <Star className="w-2.5 h-2.5 fill-amber-400" />
                            <span>{Number(job.poster.rating_avg).toFixed(1)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Actions Row */}
                <div 
                  className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800/80"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Chat launcher */}
                  {job.status !== 'open' ? (
                    <button
                      onClick={() => {
                        sound.playTap();
                        onSelectJob(job.id);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 font-bold text-xs transition cursor-pointer"
                      title="Open Direct Job Chat"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Chat</span>
                    </button>
                  ) : <div></div>}

                  {/* Role-Guarded Actions */}
                  <div className="flex items-center gap-2">
                    {/* WORKER ACTIONS */}
                    {job.is_worker && (
                      <>
                        {job.status === 'accepted' && (
                          <button
                            onClick={() => handleStartJob(job.id)}
                            disabled={isActing}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs shadow-md shadow-purple-600/25 transition cursor-pointer disabled:opacity-50"
                          >
                            <Play className="w-3.5 h-3.5 fill-white stroke-[2]" />
                            Start Job
                          </button>
                        )}

                        {job.status === 'in_progress' && (
                          <button
                            onClick={() => {
                              sound.playTap();
                              setConfirmModal({ jobId: job.id, action: 'complete', title: job.title });
                            }}
                            disabled={isActing}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-md shadow-emerald-500/25 transition cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                            Mark Completed
                          </button>
                        )}
                      </>
                    )}

                    {/* POSTER ACTIONS */}
                    {job.is_poster && (
                      <>
                        {(job.status === 'open' || job.status === 'accepted') && (
                          <button
                            onClick={() => {
                              sound.playTap();
                              setConfirmModal({ jobId: job.id, action: 'cancel', title: job.title });
                            }}
                            disabled={isActing}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-800/40 font-bold text-xs transition cursor-pointer disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Cancel
                          </button>
                        )}

                        {(job.status === 'accepted' || job.status === 'in_progress') && (
                          <button
                            onClick={() => {
                              sound.playTap();
                              setConfirmModal({ jobId: job.id, action: 'complete', title: job.title });
                            }}
                            disabled={isActing}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-md shadow-emerald-500/25 transition cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                            Mark Completed
                          </button>
                        )}
                      </>
                    )}

                    {/* Terminal States */}
                    {job.status === 'completed' && (
                      <div className="flex items-center gap-2">
                        {!job.has_rated ? (
                          <button
                            onClick={() => {
                              sound.playTap();
                              onSelectJob(job.id);
                            }}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500/20 to-amber-600/20 hover:from-amber-500/30 text-amber-300 border border-amber-500/30 font-black text-xs transition cursor-pointer shadow-sm"
                          >
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                            <span>Rate {job.is_poster ? 'Worker' : 'Poster'}</span>
                          </button>
                        ) : (
                          <span className="text-xs text-amber-400 font-bold flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            Rated
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal for Complete or Cancel */}
      {confirmModal && (
        <Portal>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-100">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                confirmModal.action === 'complete' 
                  ? 'bg-emerald-500/20 text-emerald-400' 
                  : 'bg-rose-500/20 text-rose-400'
              }`}>
                {confirmModal.action === 'complete' ? (
                  <CheckCircle2 className="w-7 h-7 stroke-[2.2]" />
                ) : (
                  <AlertTriangle className="w-7 h-7 stroke-[2.2]" />
                )}
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">
                  {confirmModal.action === 'complete' ? 'Confirm Job Completion' : 'Cancel This Job?'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {confirmModal.action === 'complete'
                    ? 'Once completed, the job status is locked and both parties can submit ratings.'
                    : 'Cancelling this job will remove it from open listings.'}
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-300 font-semibold truncate">
              &ldquo;{confirmModal.title}&rdquo;
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
              >
                Go Back
              </button>
              <button
                onClick={handleExecuteConfirmedAction}
                className={`px-5 py-2.5 rounded-xl text-xs font-black transition cursor-pointer ${
                  confirmModal.action === 'complete'
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20'
                    : 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20'
                }`}
              >
                {confirmModal.action === 'complete' ? 'Yes, Mark Completed' : 'Yes, Cancel Job'}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </div>
  );
};
