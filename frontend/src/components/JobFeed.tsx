import React, { useEffect, useState, useCallback } from 'react';
import { 
  Sparkles, 
  Shirt, 
  Leaf, 
  Car, 
  HeartHandshake, 
  Baby, 
  DollarSign, 
  MapPin, 
  Clock, 
  Star, 
  Zap, 
  Radio, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  PlusCircle, 
  Layers
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

export interface FeedJob {
  id: string;
  poster_id: string;
  category_slug: string;
  category_name: string;
  category_icon?: string;
  title: string;
  description: string;
  location_text: string;
  budget: number | null;
  status: string;
  created_at: string;
  poster: {
    id: string;
    name: string;
    avatar_url: string | null;
    rating_avg: string | number;
    rating_count: number;
  };
}

interface JobFeedProps {
  onSelectJob: (jobId: string) => void;
  onRequireAuth: () => void;
  onNavigateToPostJob: () => void;
}

export const JobFeed: React.FC<JobFeedProps> = ({ 
  onSelectJob, 
  onRequireAuth, 
  onNavigateToPostJob 
}) => {
  const { user } = useAuth();
  const { socket, connected: socketConnected } = useSocket();

  const [jobs, setJobs] = useState<FeedJob[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [feedNotification, setFeedNotification] = useState<{ text: string; type: 'info' | 'success' | 'conflict' } | null>(null);

  const categories = [
    { slug: 'all', name: 'All Jobs', icon: Layers },
    { slug: 'cleaning', name: 'Cleaning', icon: Sparkles },
    { slug: 'ironing', name: 'Ironing', icon: Shirt },
    { slug: 'gardening', name: 'Gardening', icon: Leaf },
    { slug: 'car_wash', name: 'Car Wash', icon: Car },
    { slug: 'care_taking', name: 'Care Taking', icon: HeartHandshake },
    { slug: 'babysitting', name: 'Babysitting', icon: Baby },
  ];

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const url = selectedCategory === 'all' 
        ? '/api/jobs?status=open&limit=50' 
        : `/api/jobs?status=open&category=${selectedCategory}&limit=50`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
      }
    } catch (err) {
      console.error('Failed to fetch job feed:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Real-time Socket.IO Listeners
  useEffect(() => {
    if (!socket) return;

    // When someone posts a new job
    const handleJobCreated = (newJob: FeedJob) => {
      setJobs((prevJobs) => {
        // Prevent duplicate if already in list
        if (prevJobs.some((j) => j.id === newJob.id)) return prevJobs;

        // Check if category matches filter
        if (selectedCategory !== 'all' && newJob.category_slug !== selectedCategory) {
          return prevJobs;
        }
        return [newJob, ...prevJobs];
      });

      setFeedNotification({
        text: `⚡ New job live: "${newJob.title}"`,
        type: 'info',
      });

      // Auto-clear notification after 4s
      setTimeout(() => setFeedNotification(null), 4000);
    };

    // When someone accepts a job
    const handleJobAccepted = ({ jobId }: { jobId: string; job: unknown }) => {
      setJobs((prevJobs) => prevJobs.filter((j) => j.id !== jobId));

      setFeedNotification({
        text: `✓ A job was just accepted and removed from the open feed`,
        type: 'info',
      });

      setTimeout(() => setFeedNotification(null), 4000);
    };

    socket.on('job:created', handleJobCreated);
    socket.on('job:accepted', handleJobAccepted);

    return () => {
      socket.off('job:created', handleJobCreated);
      socket.off('job:accepted', handleJobAccepted);
    };
  }, [socket, selectedCategory]);

  // Handle Accept Job Action
  const handleAcceptJob = async (job: FeedJob, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!user) {
      onRequireAuth();
      return;
    }

    if (user.id === job.poster_id) {
      setFeedNotification({
        text: 'You cannot accept your own job.',
        type: 'conflict',
      });
      return;
    }

    setAcceptingId(job.id);
    try {
      const res = await fetch(`/api/jobs/${job.id}/accept`, {
        method: 'POST',
        credentials: 'include',
      });

      const data = await res.json();

      if (res.status === 200) {
        setFeedNotification({
          text: `🎉 You successfully accepted "${job.title}"! Status is now Accepted.`,
          type: 'success',
        });
        // Remove locally from open feed immediately
        setJobs((prev) => prev.filter((j) => j.id !== job.id));
      } else if (res.status === 409) {
        setFeedNotification({
          text: `⚠️ Race condition: ${data.error || 'Someone else just accepted this job.'}`,
          type: 'conflict',
        });
        // Remove since it's no longer open
        setJobs((prev) => prev.filter((j) => j.id !== job.id));
      } else {
        setFeedNotification({
          text: data.error || 'Failed to accept job',
          type: 'conflict',
        });
      }
    } catch (err) {
      console.error('Accept error:', err);
      setFeedNotification({
        text: 'Network error accepting job',
        type: 'conflict',
      });
    } finally {
      setAcceptingId(null);
      setTimeout(() => setFeedNotification(null), 5000);
    }
  };

  const getRelativeTime = (isoString: string) => {
    const diffSeconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diffSeconds < 60) return 'Just now';
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    return `${Math.floor(diffSeconds / 86400)}d ago`;
  };

  return (
    <div className="space-y-6">
      {/* Feed Header & Realtime Pulse Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-2xl font-black text-white tracking-tight">Live Job Board</h2>
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
              socketConnected 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            }`}>
              <Radio className={`w-3 h-3 ${socketConnected ? 'animate-pulse text-emerald-400' : ''}`} />
              <span>{socketConnected ? 'Live Feed (WebSockets)' : 'Connecting...'}</span>
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Open small-jobs nearby. Tap Accept to claim a task, or post one for others.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchJobs()}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            title="Refresh Feed"
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

      {/* Real-time Notification Banner */}
      {feedNotification && (
        <div className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2 shadow-lg animate-in slide-in-from-top-2 duration-200 border ${
          feedNotification.type === 'success'
            ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
            : feedNotification.type === 'conflict'
            ? 'bg-rose-950/80 border-rose-500/40 text-rose-200'
            : 'bg-slate-900/90 border-emerald-500/30 text-emerald-300'
        }`}>
          <div className="flex items-center gap-2">
            {feedNotification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : feedNotification.type === 'conflict' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>{feedNotification.text}</span>
          </div>
          <button
            onClick={() => setFeedNotification(null)}
            className="text-slate-400 hover:text-white text-xs cursor-pointer ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Category Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {categories.map((cat) => {
          const Icon = cat.icon;
          const isSelected = selectedCategory === cat.slug;
          return (
            <button
              key={cat.slug}
              onClick={() => setSelectedCategory(cat.slug)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer border ${
                isSelected
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20'
                  : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5 stroke-[2.2]" />
              <span>{cat.name}</span>
            </button>
          );
        })}
      </div>

      {/* Jobs Feed Grid */}
      {loading ? (
        <div className="py-16 text-center space-y-3">
          <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-slate-400">Loading open jobs...</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-slate-900/40 border border-slate-800/80 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
            <Layers className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">No open jobs right now</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              {selectedCategory === 'all'
                ? 'Be the first to post a small service job on the shared board!'
                : `No open jobs in the ${selectedCategory} category right now.`}
            </p>
          </div>
          <button
            onClick={onNavigateToPostJob}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5 stroke-[2.5]" />
            Post This Job
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {jobs.map((job) => {
            const isMyJob = user?.id === job.poster_id;
            const isAccepting = acceptingId === job.id;

            return (
              <div
                key={job.id}
                onClick={() => onSelectJob(job.id)}
                className="group relative p-5 rounded-2xl bg-slate-900/60 border border-slate-800/90 hover:border-emerald-500/40 hover:bg-slate-900/90 transition-all duration-200 flex flex-col justify-between gap-4 cursor-pointer shadow-lg hover:shadow-emerald-500/5"
              >
                {/* Top Row: Category + Budget */}
                <div className="flex items-start justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 capitalize">
                    <Sparkles className="w-3 h-3" />
                    {job.category_name}
                  </span>

                  <div className="flex items-center gap-1 px-3 py-1 rounded-xl bg-slate-950 border border-slate-800 text-white font-extrabold text-sm">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" />
                    <span>{job.budget !== null ? Number(job.budget).toFixed(2) : 'Negotiable'}</span>
                  </div>
                </div>

                {/* Job Title & Description */}
                <div>
                  <h3 className="text-base font-bold text-white group-hover:text-emerald-300 transition-colors line-clamp-1">
                    {job.title}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                    {job.description || 'No additional details provided.'}
                  </p>
                </div>

                {/* Location & Time Posted */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                  <div className="flex items-center gap-1.5 truncate max-w-[65%]">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="truncate">{job.location_text}</span>
                  </div>

                  <div className="flex items-center gap-1 text-slate-500 shrink-0">
                    <Clock className="w-3 h-3" />
                    <span>{getRelativeTime(job.created_at)}</span>
                  </div>
                </div>

                {/* Bottom Row: Poster Info & Accept Button */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-emerald-300 font-bold flex items-center justify-center text-xs border border-emerald-500/20">
                      {job.poster.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-200 block leading-tight">
                        {job.poster.name}
                      </span>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                        <span>{Number(job.poster.rating_avg).toFixed(1)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Accept Action Button */}
                  <div>
                    {isMyJob ? (
                      <span className="text-[11px] font-semibold text-slate-500 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                        Your Posting
                      </span>
                    ) : (
                      <button
                        onClick={(e) => handleAcceptJob(job, e)}
                        disabled={isAccepting}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 transition cursor-pointer disabled:opacity-50"
                      >
                        {isAccepting ? (
                          <div className="w-3 h-3 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <Zap className="w-3 h-3 stroke-[2.5]" />
                        )}
                        Accept
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
