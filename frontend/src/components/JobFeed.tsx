import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  PlusCircle, 
  Layers,
  Search,
  SlidersHorizontal,
  Map,
  Grid,
  ListFilter,
  X,
  ArrowUpDown
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { InteractiveMapRadar } from './InteractiveMapRadar';
import { sound } from '../utils/sound';

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

type ViewMode = 'grid' | 'split' | 'compact';
type SortOption = 'newest' | 'budget_high' | 'budget_low';
type BudgetFilter = 'all' | 'under50' | '50to100' | 'over100' | 'negotiable';

export const JobFeed: React.FC<JobFeedProps> = ({ 
  onSelectJob, 
  onRequireAuth, 
  onNavigateToPostJob 
}) => {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [jobs, setJobs] = useState<FeedJob[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [budgetFilter, setBudgetFilter] = useState<BudgetFilter>('all');
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
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
        ? '/api/jobs?status=open&limit=100' 
        : `/api/jobs?status=open&category=${selectedCategory}&limit=100`;

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
        if (prevJobs.some((j) => j.id === newJob.id)) return prevJobs;
        if (selectedCategory !== 'all' && newJob.category_slug !== selectedCategory) {
          return prevJobs;
        }
        return [newJob, ...prevJobs];
      });

      sound.playMessagePop();

      setFeedNotification({
        text: `⚡ New job live: "${newJob.title}"`,
        type: 'info',
      });

      setTimeout(() => setFeedNotification(null), 4000);
    };

    // When someone accepts a job
    const handleJobAccepted = ({ jobId }: { jobId: string; job: unknown }) => {
      setJobs((prevJobs) => prevJobs.filter((j) => j.id !== jobId));

      setFeedNotification({
        text: `✓ A job was just accepted and claimed live`,
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
      sound.playTap();
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
        sound.playChime();
        setFeedNotification({
          text: `🎉 You successfully accepted "${job.title}"! Opening job chat...`,
          type: 'success',
        });
        setJobs((prev) => prev.filter((j) => j.id !== job.id));
        onSelectJob(job.id);
      } else if (res.status === 409) {
        setFeedNotification({
          text: `⚠️ Race condition: ${data.error || 'Someone else just accepted this job.'}`,
          type: 'conflict',
        });
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

  // Filter & Sort jobs
  const filteredAndSortedJobs = useMemo(() => {
    let result = [...jobs];

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.description?.toLowerCase().includes(q) ||
          j.location_text.toLowerCase().includes(q) ||
          j.category_name.toLowerCase().includes(q)
      );
    }

    // Budget filter
    if (budgetFilter === 'under50') {
      result = result.filter((j) => j.budget !== null && j.budget < 50);
    } else if (budgetFilter === '50to100') {
      result = result.filter((j) => j.budget !== null && j.budget >= 50 && j.budget <= 100);
    } else if (budgetFilter === 'over100') {
      result = result.filter((j) => j.budget !== null && j.budget > 100);
    } else if (budgetFilter === 'negotiable') {
      result = result.filter((j) => j.budget === null);
    }

    // Sorting
    if (sortBy === 'newest') {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === 'budget_high') {
      result.sort((a, b) => (b.budget ?? -1) - (a.budget ?? -1));
    } else if (sortBy === 'budget_low') {
      result.sort((a, b) => (a.budget ?? 999999) - (b.budget ?? 999999));
    }

    return result;
  }, [jobs, searchQuery, budgetFilter, sortBy]);

  const getRelativeTime = (isoString: string) => {
    const diffSeconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diffSeconds < 60) return 'Just now';
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    return `${Math.floor(diffSeconds / 86400)}d ago`;
  };

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: jobs.length };
    jobs.forEach((j) => {
      counts[j.category_slug] = (counts[j.category_slug] || 0) + 1;
    });
    return counts;
  }, [jobs]);

  return (
    <div className="w-full space-y-6">
      {/* Real-time Notification Banner */}
      {feedNotification && (
        <div className={`p-4 rounded-2xl text-xs font-bold flex items-center justify-between gap-3 shadow-2xl animate-in slide-in-from-top-3 duration-200 border ${
          feedNotification.type === 'success'
            ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
            : feedNotification.type === 'conflict'
            ? 'bg-rose-950/90 border-rose-500/50 text-rose-200'
            : 'bg-slate-900/95 border-emerald-500/40 text-emerald-300'
        }`}>
          <div className="flex items-center gap-2.5">
            {feedNotification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : feedNotification.type === 'conflict' ? (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            ) : (
              <Zap className="w-5 h-5 text-emerald-400 shrink-0 animate-bounce" />
            )}
            <span className="text-sm">{feedNotification.text}</span>
          </div>
          <button
            onClick={() => setFeedNotification(null)}
            className="p-1 rounded-lg text-slate-400 hover:text-white text-xs cursor-pointer ml-2 hover:bg-slate-800"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Marketplace Bar: Stats, Search, View Switcher */}
      <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/80 border border-slate-800/80 shadow-xl backdrop-blur-md flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Left: Search input */}
        <div className="relative flex-1 max-w-xl">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by task title, location, keywords..."
            className="w-full pl-10 pr-9 py-2.5 rounded-2xl bg-slate-950/90 border border-slate-800 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 text-xs text-white placeholder-slate-500 outline-none transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Center: Budget & Sort Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Budget filter dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-950/90 border border-slate-800 rounded-2xl px-3 py-1.5 text-xs text-slate-300">
            <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
            <select
              value={budgetFilter}
              onChange={(e) => {
                sound.playTap();
                setBudgetFilter(e.target.value as BudgetFilter);
              }}
              className="bg-transparent text-xs font-semibold text-white outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900">All Budgets</option>
              <option value="under50" className="bg-slate-900">&lt; $50</option>
              <option value="50to100" className="bg-slate-900">$50 – $100</option>
              <option value="over100" className="bg-slate-900">&gt; $100</option>
              <option value="negotiable" className="bg-slate-900">Negotiable only</option>
            </select>
          </div>

          {/* Sort By dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-950/90 border border-slate-800 rounded-2xl px-3 py-1.5 text-xs text-slate-300">
            <ArrowUpDown className="w-3.5 h-3.5 text-sky-400" />
            <select
              value={sortBy}
              onChange={(e) => {
                sound.playTap();
                setSortBy(e.target.value as SortOption);
              }}
              className="bg-transparent text-xs font-semibold text-white outline-none cursor-pointer"
            >
              <option value="newest" className="bg-slate-900">Newest First</option>
              <option value="budget_high" className="bg-slate-900">Budget: High to Low</option>
              <option value="budget_low" className="bg-slate-900">Budget: Low to High</option>
            </select>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center bg-slate-950 p-1 rounded-2xl border border-slate-800">
            <button
              onClick={() => {
                sound.playTap();
                setViewMode('split');
              }}
              className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                viewMode === 'split'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Split Map Radar View (InDrive Style)"
            >
              <Map className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Radar</span>
            </button>

            <button
              onClick={() => {
                sound.playTap();
                setViewMode('grid');
              }}
              className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Full-Width Multi-Column Grid View"
            >
              <Grid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Grid</span>
            </button>

            <button
              onClick={() => {
                sound.playTap();
                setViewMode('compact');
              }}
              className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                viewMode === 'compact'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Compact List View"
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">List</span>
            </button>
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => {
              sound.playTap();
              fetchJobs();
            }}
            disabled={loading}
            className="p-2.5 rounded-2xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            title="Refresh Feed"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Category Filter Chips Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {categories.map((cat) => {
          const Icon = cat.icon;
          const isSelected = selectedCategory === cat.slug;
          const count = categoryCounts[cat.slug] || 0;

          return (
            <button
              key={cat.slug}
              onClick={() => {
                sound.playTap();
                setSelectedCategory(cat.slug);
              }}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition cursor-pointer border ${
                isSelected
                  ? 'bg-gradient-to-r from-emerald-400 to-teal-500 text-slate-950 border-emerald-300 shadow-lg shadow-emerald-500/20 scale-102'
                  : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-800'
              }`}
            >
              <Icon className="w-4 h-4 stroke-[2.2]" />
              <span>{cat.name}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                isSelected ? 'bg-slate-950/25 text-slate-950' : 'bg-slate-950 text-slate-400'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Jobs Layout: Split Radar View vs Full Grid View vs Compact List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 py-8">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="p-6 rounded-3xl bg-slate-900/50 border border-slate-800 animate-pulse space-y-4">
              <div className="flex justify-between items-center">
                <div className="h-6 w-24 bg-slate-800 rounded-lg"></div>
                <div className="h-6 w-16 bg-slate-800 rounded-lg"></div>
              </div>
              <div className="h-5 w-3/4 bg-slate-800 rounded-lg"></div>
              <div className="h-12 w-full bg-slate-800/60 rounded-xl"></div>
              <div className="h-8 w-full bg-slate-800/40 rounded-xl"></div>
            </div>
          ))}
        </div>
      ) : filteredAndSortedJobs.length === 0 ? (
        <div className="p-16 text-center rounded-3xl bg-slate-900/40 border border-slate-800/80 space-y-4 max-w-xl mx-auto my-8">
          <div className="w-16 h-16 rounded-3xl bg-slate-800 flex items-center justify-center mx-auto text-slate-500 shadow-inner">
            <Layers className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">No open jobs found</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
              {searchQuery
                ? `No jobs match "${searchQuery}". Try clearing search filters or changing category.`
                : 'There are currently no open jobs matching your criteria. Be the first to post a new request!'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer"
              >
                Clear Search
              </button>
            )}
            <button
              onClick={() => {
                sound.playTap();
                onNavigateToPostJob();
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 transition cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 stroke-[2.5]" />
              Post This Job
            </button>
          </div>
        </div>
      ) : viewMode === 'split' ? (
        /* SPLIT VIEW (InDrive Style: Radar on Left, Cards on Right) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Neighborhood Radar & Live Stats (Sticky) */}
          <div className="lg:col-span-5 xl:col-span-5 space-y-4 lg:sticky lg:top-20">
            <InteractiveMapRadar
              jobs={filteredAndSortedJobs}
              selectedJobId={activeJobId}
              onSelectJob={(id) => {
                setActiveJobId(id);
                onSelectJob(id);
              }}
              selectedCategory={selectedCategory}
            />

            {/* Quick Live Market Stats Card */}
            <div className="p-4 rounded-3xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between text-xs text-slate-400 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                <span>Active Demand: <strong className="text-white">{filteredAndSortedJobs.length} Tasks</strong></span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <Zap className="w-3.5 h-3.5" />
                <span>Instant Acceptance</span>
              </div>
            </div>
          </div>

          {/* Right Column: Scrollable Cards Grid */}
          <div className="lg:col-span-7 xl:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredAndSortedJobs.map((job) => renderJobCard(job))}
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        /* FULL-WIDTH GRID VIEW (3 to 4 columns across entire screen width) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
          {filteredAndSortedJobs.map((job) => renderJobCard(job))}
        </div>
      ) : (
        /* COMPACT LIST VIEW */
        <div className="space-y-3">
          {filteredAndSortedJobs.map((job) => renderCompactJobRow(job))}
        </div>
      )}
    </div>
  );

  /* Render Single Modern Interactive Card */
  function renderJobCard(job: FeedJob) {
    const isMyJob = user?.id === job.poster_id;
    const isAccepting = acceptingId === job.id;
    const isActive = activeJobId === job.id;

    return (
      <div
        key={job.id}
        onClick={() => {
          sound.playTap();
          setActiveJobId(job.id);
          onSelectJob(job.id);
        }}
        className={`group relative p-5 rounded-3xl bg-slate-900/80 border transition-all duration-200 flex flex-col justify-between gap-4 cursor-pointer shadow-lg backdrop-blur-sm ${
          isActive
            ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-emerald-500/10'
            : 'border-slate-800/90 hover:border-emerald-500/50 hover:bg-slate-900/95 hover:-translate-y-1 hover:shadow-2xl'
        }`}
      >
        {/* Top Header: Category & Budget */}
        <div className="flex items-start justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 capitalize">
            <Sparkles className="w-3.5 h-3.5" />
            {job.category_name}
          </span>

          <div className="flex items-center gap-1 px-3 py-1.5 rounded-2xl bg-slate-950 border border-slate-800 text-white font-black text-sm shadow-inner">
            <DollarSign className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" />
            <span>{job.budget !== null ? Number(job.budget).toFixed(2) : 'Negotiable'}</span>
          </div>
        </div>

        {/* Title & Description */}
        <div>
          <h3 className="text-base font-extrabold text-white group-hover:text-emerald-300 transition-colors line-clamp-1">
            {job.title}
          </h3>
          <p className="text-xs text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
            {job.description || 'No additional details provided.'}
          </p>
        </div>

        {/* Location & Time Posted */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/60">
          <div className="flex items-center gap-1.5 truncate max-w-[65%]">
            <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="truncate">{job.location_text}</span>
          </div>

          <div className="flex items-center gap-1 text-slate-500 shrink-0 font-medium">
            <Clock className="w-3 h-3" />
            <span>{getRelativeTime(job.created_at)}</span>
          </div>
        </div>

        {/* Bottom Bar: Poster Avatar & Accept / View Action */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500/30 to-teal-500/20 text-emerald-300 font-black flex items-center justify-center text-xs border border-emerald-500/30 shadow-sm">
              {job.poster.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <span className="text-xs font-bold text-slate-200 block leading-tight">
                {job.poster.name}
              </span>
              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                <span className="font-bold text-slate-300">{Number(job.poster.rating_avg).toFixed(1)}</span>
                <span className="text-slate-500">({job.poster.rating_count})</span>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div>
            {isMyJob ? (
              <span className="text-[11px] font-bold text-slate-400 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                Your Posting
              </span>
            ) : (
              <button
                onClick={(e) => handleAcceptJob(job, e)}
                disabled={isAccepting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-md shadow-emerald-500/20 transition cursor-pointer disabled:opacity-50 hover:scale-105 active:scale-95"
              >
                {isAccepting ? (
                  <div className="w-3 h-3 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Zap className="w-3.5 h-3.5 stroke-[2.5]" />
                )}
                Accept
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* Render Compact Row */
  function renderCompactJobRow(job: FeedJob) {
    const isMyJob = user?.id === job.poster_id;
    const isAccepting = acceptingId === job.id;

    return (
      <div
        key={job.id}
        onClick={() => {
          sound.playTap();
          onSelectJob(job.id);
        }}
        className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-emerald-500/40 hover:bg-slate-900 transition flex items-center justify-between gap-4 cursor-pointer"
      >
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white truncate">{job.title}</span>
              <span className="text-[10px] font-semibold text-emerald-400 capitalize px-2 py-0.2 bg-emerald-500/10 rounded-md border border-emerald-500/20">
                {job.category_name}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
              <span>{job.location_text}</span>
              <span>&bull;</span>
              <span>By {job.poster.name} (★ {Number(job.poster.rating_avg).toFixed(1)})</span>
              <span>&bull;</span>
              <span>{getRelativeTime(job.created_at)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="font-black text-sm text-white">
              {job.budget !== null ? `$${Number(job.budget).toFixed(2)}` : 'Negotiable'}
            </div>
          </div>

          {isMyJob ? (
            <span className="text-[11px] font-semibold text-slate-500 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
              Mine
            </span>
          ) : (
            <button
              onClick={(e) => handleAcceptJob(job, e)}
              disabled={isAccepting}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition cursor-pointer"
            >
              Accept
            </button>
          )}
        </div>
      </div>
    );
  }
};
