import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Sparkles,
  Shirt,
  Leaf,
  Car,
  HeartHandshake,
  Baby,
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
  Map as MapIcon,
  Grid,
  ListFilter,
  X,
  ArrowUpDown,
  LocateFixed,
  Navigation,
  Send,
  Hourglass,
  CalendarClock,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useViewerLocation } from '../hooks/useViewerLocation';
import { Job, MyOfferSummary } from '../types/marketplace';
import { formatDistance, formatMoney, formatMoneyShort, formatSchedule, paymentLabel, readApiError, relativeTime } from '../utils/format';
import { PlaceResult, haversineKm, searchPlaces } from '../utils/geo';
import { requestNotificationPermission } from '../utils/notify';
import { MapView, MapMarker } from './MapView';
import { OfferModal } from './OfferModal';
import { WorkModeCard } from './WorkModeCard';
import { Avatar } from './Avatar';
import { goToProfile, useIdRequirement } from '../hooks/useIdRequirement';
import { BadgeCheck } from 'lucide-react';
import { sound } from '../utils/sound';

export type FeedJob = Job;

interface JobFeedProps {
  onSelectJob: (jobId: string) => void;
  onRequireAuth: () => void;
  onNavigateToPostJob: () => void;
}

type ViewMode = 'split' | 'grid' | 'compact';
type SortOption = 'nearest' | 'newest' | 'budget_high' | 'budget_low';
type BudgetFilter = 'all' | 'under50' | '50to100' | 'over100' | 'negotiable';

const RADIUS_OPTIONS: (number | null)[] = [2, 5, 10, 25, 50, null];

const CATEGORIES = [
  { slug: 'all', name: 'All Jobs', icon: Layers },
  { slug: 'cleaning', name: 'Cleaning', icon: Sparkles },
  { slug: 'ironing', name: 'Ironing', icon: Shirt },
  { slug: 'gardening', name: 'Gardening', icon: Leaf },
  { slug: 'car_wash', name: 'Car Wash', icon: Car },
  { slug: 'care_taking', name: 'Care Taking', icon: HeartHandshake },
  { slug: 'babysitting', name: 'Babysitting', icon: Baby },
];

export const JobFeed: React.FC<JobFeedProps> = ({ onSelectJob, onRequireAuth, onNavigateToPostJob }) => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const { location, setLocation, locate, locating, error: locationError, clearError } = useViewerLocation();
  const needsId = useIdRequirement();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [sortBy, setSortBy] = useState<SortOption>(() => (location ? 'nearest' : 'newest'));
  const [budgetFilter, setBudgetFilter] = useState<BudgetFilter>('all');
  const [radiusKm, setRadiusKm] = useState<number | null>(10);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [offerJob, setOfferJob] = useState<Job | null>(null);
  const [quickBusyId, setQuickBusyId] = useState<string | null>(null);
  const [feedNotification, setFeedNotification] = useState<{ text: string; type: 'info' | 'success' | 'conflict' } | null>(null);

  // Area search (explicit submit only, per the geocoder's usage policy)
  const [areaQuery, setAreaQuery] = useState('');
  const [areaResults, setAreaResults] = useState<PlaceResult[]>([]);
  const [areaSearching, setAreaSearching] = useState(false);
  const [areaError, setAreaError] = useState<string | null>(null);
  const [changingArea, setChangingArea] = useState(false);

  const notify = useCallback((text: string, type: 'info' | 'success' | 'conflict' = 'info') => {
    setFeedNotification({ text, type });
    window.setTimeout(() => setFeedNotification((n) => (n?.text === text ? null : n)), 5000);
  }, []);

  const sortParam = sortBy === 'nearest' && location ? 'distance' : 'newest';

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: 'open', limit: '100', sort: sortParam });
      if (selectedCategory !== 'all') params.set('category', selectedCategory);
      if (location) {
        params.set('lat', String(location.lat));
        params.set('lng', String(location.lng));
        if (radiusKm !== null) params.set('radius_km', String(radiusKm));
      }
      const res = await fetch(`/api/jobs?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error(await readApiError(res, 'Could not load jobs'));
      const data = await res.json();
      setJobs(data.jobs || []);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load jobs');
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, location, radiusKm, sortParam]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Does a job pushed over the socket belong in the current view?
  const withDistance = useCallback(
    (job: Job): Job | null => {
      if (selectedCategory !== 'all' && job.category_slug !== selectedCategory) return null;
      if (!location) return job;
      if (job.latitude === null || job.longitude === null) return radiusKm === null ? { ...job, distance_km: null } : null;
      const km = Math.round(haversineKm(location, { lat: job.latitude, lng: job.longitude }) * 10) / 10;
      if (radiusKm !== null && km > radiusKm) return null;
      return { ...job, distance_km: km };
    },
    [selectedCategory, location, radiusKm]
  );

  // Realtime feed
  useEffect(() => {
    if (!socket) return;

    const addJob = (incoming: Job, text: string) => {
      const job = withDistance(incoming);
      if (!job) return;
      setJobs((prev) => (prev.some((j) => j.id === job.id) ? prev : [job, ...prev]));
      if (incoming.poster_id !== user?.id) {
        sound.playMessagePop();
        notify(text);
      }
    };
    const onCreated = (job: Job) => addJob(job, `New job nearby: "${job.title}"`);
    const onReopened = (data: { job: Job }) => data.job && addJob(data.job, `Job open again: "${data.job.title}"`);
    const onTaken = ({ jobId }: { jobId: string }) => setJobs((prev) => prev.filter((j) => j.id !== jobId));
    const onUpdated = ({ jobId, job }: { jobId: string; job: Job }) => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId ? { ...j, budget: job.budget, title: job.title, description: job.description, photos: job.photos, updated_at: job.updated_at } : j
        )
      );
    };
    const onMyOfferUpdated = ({ jobId, status }: { jobId: string; status: MyOfferSummary['status'] }) => {
      setJobs((prev) => prev.map((j) => (j.id === jobId && j.my_offer ? { ...j, my_offer: { ...j.my_offer, status } } : j)));
    };

    socket.on('job:created', onCreated);
    socket.on('job:reopened', onReopened);
    socket.on('job:accepted', onTaken);
    socket.on('job:updated', onUpdated);
    socket.on('offer:updated', onMyOfferUpdated);
    socket.on('connect', fetchJobs);
    return () => {
      socket.off('job:created', onCreated);
      socket.off('job:reopened', onReopened);
      socket.off('job:accepted', onTaken);
      socket.off('job:updated', onUpdated);
      socket.off('offer:updated', onMyOfferUpdated);
      socket.off('connect', fetchJobs);
    };
  }, [socket, withDistance, fetchJobs, notify, user?.id]);

  const requireUser = () => {
    if (!user) {
      sound.playTap();
      onRequireAuth();
      return false;
    }
    return true;
  };

  // One tap: offer exactly the customer's price
  const handleQuickAccept = async (job: Job, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!requireUser() || job.budget === null) return;
    setQuickBusyId(job.id);
    try {
      const res = await fetch(`/api/jobs/${job.id}/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ price: Number(job.budget) }),
      });
      if (!res.ok) throw new Error(await readApiError(res, 'Could not send your offer'));
      const data = await res.json();
      sound.playChime();
      requestNotificationPermission();
      setJobs((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? { ...j, my_offer: { id: data.offer.id, price: data.offer.price, status: 'pending', eta_minutes: data.offer.eta_minutes, message: data.offer.message } }
            : j
        )
      );
      notify(`Offer sent at ${formatMoney(job.budget)}. You'll be notified if ${job.poster.name} hires you.`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not send your offer', 'conflict');
      if (err instanceof Error && /no longer/i.test(err.message)) setJobs((prev) => prev.filter((j) => j.id !== job.id));
    } finally {
      setQuickBusyId(null);
    }
  };

  const openOfferModal = (job: Job, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!requireUser()) return;
    sound.playTap();
    setOfferJob(job);
  };

  const runAreaSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setAreaSearching(true);
    setAreaError(null);
    try {
      const results = await searchPlaces(areaQuery);
      setAreaResults(results);
      if (results.length === 0) setAreaError('No places found. Try a suburb and city, e.g. "Avondale, Harare".');
    } catch (err) {
      setAreaError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setAreaSearching(false);
    }
  };

  const chooseArea = (place: PlaceResult) => {
    setLocation({ lat: place.lat, lng: place.lng, label: place.label, source: 'search' });
    setAreaResults([]);
    setAreaQuery('');
    setChangingArea(false);
    setSortBy('nearest');
  };

  const useMyLocation = async () => {
    clearError();
    const loc = await locate();
    if (loc) {
      setChangingArea(false);
      setSortBy('nearest');
    }
  };

  // Client-side search, budget filter and secondary sorting
  const visibleJobs = useMemo(() => {
    let result = [...jobs];
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
    const budgetOf = (j: Job) => (j.budget === null ? null : Number(j.budget));
    if (budgetFilter === 'under50') result = result.filter((j) => budgetOf(j) !== null && budgetOf(j)! < 50);
    if (budgetFilter === '50to100') result = result.filter((j) => budgetOf(j) !== null && budgetOf(j)! >= 50 && budgetOf(j)! <= 100);
    if (budgetFilter === 'over100') result = result.filter((j) => budgetOf(j) !== null && budgetOf(j)! > 100);
    if (budgetFilter === 'negotiable') result = result.filter((j) => j.budget === null);

    if (sortBy === 'nearest' && location) {
      result.sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
    } else if (sortBy === 'budget_high') {
      result.sort((a, b) => (budgetOf(b) ?? -1) - (budgetOf(a) ?? -1));
    } else if (sortBy === 'budget_low') {
      result.sort((a, b) => (budgetOf(a) ?? Infinity) - (budgetOf(b) ?? Infinity));
    } else {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return result;
  }, [jobs, searchQuery, budgetFilter, sortBy, location]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: jobs.length };
    jobs.forEach((j) => {
      counts[j.category_slug] = (counts[j.category_slug] || 0) + 1;
    });
    return counts;
  }, [jobs]);

  const mapMarkers = useMemo<MapMarker[]>(() => {
    const markers: MapMarker[] = visibleJobs
      .filter((j) => j.latitude !== null && j.longitude !== null)
      .map((j) => ({
        id: j.id,
        lat: j.latitude!,
        lng: j.longitude!,
        kind: j.id === activeJobId ? 'job-active' : 'job',
        label: j.budget !== null ? formatMoneyShort(j.budget) : 'Offer',
        title: j.title,
      }));
    if (location) markers.push({ id: '__me', lat: location.lat, lng: location.lng, kind: 'me', title: 'You' });
    return markers;
  }, [visibleJobs, activeJobId, location]);

  const jobsWithoutPin = visibleJobs.filter((j) => j.latitude === null || j.longitude === null).length;

  return (
    <div className="w-full space-y-5">
      {feedNotification && (
        <div
          role="status"
          className={`p-4 rounded-2xl text-xs font-bold flex items-center justify-between gap-3 shadow-2xl border ${
            feedNotification.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
              : feedNotification.type === 'conflict'
              ? 'bg-rose-950/90 border-rose-500/50 text-rose-200'
              : 'bg-slate-900/95 border-emerald-500/40 text-emerald-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedNotification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : feedNotification.type === 'conflict' ? (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            ) : (
              <Zap className="w-5 h-5 text-emerald-400 shrink-0" />
            )}
            <span className="text-sm">{feedNotification.text}</span>
          </div>
          <button onClick={() => setFeedNotification(null)} className="p-1 rounded-lg text-slate-400 hover:text-white" aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {user && <WorkModeCard location={location} onLocate={locate} locating={locating} />}

      {/* Location bar */}
      <div className="p-4 rounded-3xl bg-slate-900/80 border border-slate-800/80 shadow-xl space-y-3">
        {location && !changingArea ? (
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 shrink-0 rounded-2xl bg-sky-500/15 border border-sky-500/30 text-sky-300 flex items-center justify-center">
                <Navigation className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase font-bold text-slate-400">Jobs near</p>
                <p className="text-sm font-black text-white truncate">{location.label}</p>
              </div>
              <button onClick={() => setChangingArea(true)} className="text-xs font-bold text-emerald-400 hover:underline shrink-0">
                Change
              </button>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none" role="group" aria-label="Search radius">
              <span className="text-[11px] text-slate-400 font-semibold mr-1 shrink-0">Within</span>
              {RADIUS_OPTIONS.map((km) => (
                <button
                  key={km ?? 'any'}
                  onClick={() => {
                    sound.playTap();
                    setRadiusKm(km);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border shrink-0 ${
                    radiusKm === km ? 'bg-emerald-500 text-slate-950 border-emerald-400' : 'bg-slate-950 text-slate-300 border-slate-800 hover:text-white'
                  }`}
                >
                  {km === null ? 'Any distance' : `${km} km`}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <p className="text-sm font-bold text-white flex-1">
                {location ? 'Change where you look for jobs' : 'Find jobs near you'}
                <span className="block text-xs font-normal text-slate-400">Share your location or search for an area to see distances and nearby jobs first.</span>
              </p>
              <button
                onClick={useMyLocation}
                disabled={locating}
                className="px-4 py-2.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {locating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
                Use my location
              </button>
              {location && (
                <button onClick={() => setChangingArea(false)} className="text-xs text-slate-400 hover:text-white">
                  Keep {location.label}
                </button>
              )}
            </div>
            <form onSubmit={runAreaSearch} className="flex gap-2">
              <div className="relative flex-1">
                <MapPin className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  value={areaQuery}
                  onChange={(e) => setAreaQuery(e.target.value)}
                  placeholder="Or search an area, e.g. Avondale, Harare"
                  aria-label="Search for an area"
                  className="w-full pl-10 pr-3 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:border-emerald-500 text-sm text-white placeholder-slate-500 outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={areaSearching || areaQuery.trim().length < 3}
                className="px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold disabled:opacity-50"
              >
                {areaSearching ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Search'}
              </button>
            </form>
            {(locationError || areaError) && (
              <p className="text-xs text-amber-300 flex gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" /> {locationError || areaError}
              </p>
            )}
            {areaResults.length > 0 && (
              <ul className="rounded-2xl border border-slate-800 divide-y divide-slate-800 overflow-hidden">
                {areaResults.map((place) => (
                  <li key={`${place.lat},${place.lng}`}>
                    <button onClick={() => chooseArea(place)} className="w-full text-left px-4 py-2.5 bg-slate-950 hover:bg-slate-900">
                      <span className="text-sm font-bold text-white block">{place.label}</span>
                      <span className="text-[11px] text-slate-500 block truncate">{place.fullLabel}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Search, filters, view */}
      <div className="p-3 sm:p-4 rounded-3xl bg-slate-900/80 border border-slate-800/80 shadow-xl flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xl">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search jobs by title, area, keywords..."
            aria-label="Search jobs"
            className="w-full pl-10 pr-9 py-2.5 rounded-2xl bg-slate-950/90 border border-slate-800 focus:border-emerald-500/60 text-sm text-white placeholder-slate-500 outline-none"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white" aria-label="Clear search">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 bg-slate-950/90 border border-slate-800 rounded-2xl px-3 py-1.5 text-xs text-slate-300">
            <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
            <select
              value={budgetFilter}
              onChange={(e) => setBudgetFilter(e.target.value as BudgetFilter)}
              className="bg-transparent text-xs font-semibold text-white outline-none cursor-pointer"
              aria-label="Filter by price"
            >
              <option value="all" className="bg-slate-900">Any price</option>
              <option value="under50" className="bg-slate-900">Under $50</option>
              <option value="50to100" className="bg-slate-900">$50 – $100</option>
              <option value="over100" className="bg-slate-900">Over $100</option>
              <option value="negotiable" className="bg-slate-900">Open to offers</option>
            </select>
          </label>

          <label className="flex items-center gap-1.5 bg-slate-950/90 border border-slate-800 rounded-2xl px-3 py-1.5 text-xs text-slate-300">
            <ArrowUpDown className="w-3.5 h-3.5 text-sky-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="bg-transparent text-xs font-semibold text-white outline-none cursor-pointer"
              aria-label="Sort jobs"
            >
              {location && <option value="nearest" className="bg-slate-900">Nearest first</option>}
              <option value="newest" className="bg-slate-900">Newest first</option>
              <option value="budget_high" className="bg-slate-900">Price: high to low</option>
              <option value="budget_low" className="bg-slate-900">Price: low to high</option>
            </select>
          </label>

          <div className="flex items-center bg-slate-950 p-1 rounded-2xl border border-slate-800" role="group" aria-label="Layout">
            {([
              { mode: 'split', icon: MapIcon, label: 'Map' },
              { mode: 'grid', icon: Grid, label: 'Grid' },
              { mode: 'compact', icon: ListFilter, label: 'List' },
            ] as const).map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                aria-pressed={viewMode === mode}
                className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                  viewMode === mode ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          <button
            onClick={fetchJobs}
            disabled={loading}
            className="p-2.5 rounded-2xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white"
            aria-label="Refresh jobs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Categories */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isSelected = selectedCategory === cat.slug;
          return (
            <button
              key={cat.slug}
              onClick={() => {
                sound.playTap();
                setSelectedCategory(cat.slug);
              }}
              aria-pressed={isSelected}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap border ${
                isSelected
                  ? 'bg-gradient-to-r from-emerald-400 to-teal-500 text-slate-950 border-emerald-300'
                  : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{cat.name}</span>
              {selectedCategory === 'all' && (
                <span className={`text-[10px] px-1.5 rounded-full font-mono ${isSelected ? 'bg-slate-950/25' : 'bg-slate-950 text-slate-400'}`}>
                  {categoryCounts[cat.slug] || 0}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loadError && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {loadError}</span>
          <button onClick={fetchJobs} className="px-3 py-1.5 rounded-xl bg-slate-800 text-white text-xs font-bold">Retry</button>
        </div>
      )}

      {/* Jobs */}
      {loading && jobs.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 py-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="p-6 rounded-3xl bg-slate-900/50 border border-slate-800 animate-pulse space-y-4">
              <div className="h-6 w-24 bg-slate-800 rounded-lg" />
              <div className="h-5 w-3/4 bg-slate-800 rounded-lg" />
              <div className="h-12 w-full bg-slate-800/60 rounded-xl" />
            </div>
          ))}
        </div>
      ) : viewMode === 'split' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-5 space-y-2 lg:sticky lg:top-20">
            <MapView
              markers={mapMarkers}
              circles={location && radiusKm !== null ? [{ center: location, radiusMeters: radiusKm * 1000, tone: 'radius' }] : []}
              center={location}
              zoom={radiusKm && radiusKm > 10 ? 10 : 12}
              fitToMarkers={!location}
              onMarkerClick={(id) => {
                if (id === '__me') return;
                setActiveJobId(id);
                onSelectJob(id);
              }}
              className="h-64 sm:h-80 lg:h-[460px]"
            />
            <p className="text-[11px] text-slate-500 px-1">
              Pins show the approximate area of each job.
              {jobsWithoutPin > 0 && ` ${jobsWithoutPin} job${jobsWithoutPin === 1 ? ' has' : 's have'} no map location.`}
            </p>
          </div>
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {visibleJobs.length === 0 ? renderEmpty() : visibleJobs.map((job) => renderJobCard(job))}
          </div>
        </div>
      ) : visibleJobs.length === 0 ? (
        renderEmpty()
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5">{visibleJobs.map((job) => renderJobCard(job))}</div>
      ) : (
        <div className="space-y-3">{visibleJobs.map((job) => renderCompactJobRow(job))}</div>
      )}

      {offerJob && (
        <OfferModal
          job={offerJob}
          existingOffer={offerJob.my_offer}
          onClose={() => setOfferJob(null)}
          onSaved={(offer, message) => {
            setJobs((prev) => prev.map((j) => (j.id === offerJob.id ? { ...j, my_offer: offer } : j)));
            setOfferJob(null);
            notify(message, 'success');
          }}
        />
      )}
    </div>
  );

  function renderEmpty() {
    return (
      <div className="sm:col-span-2 p-10 text-center rounded-3xl bg-slate-900/40 border border-slate-800/80 space-y-4">
        <div className="w-14 h-14 rounded-3xl bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
          <Layers className="w-7 h-7" />
        </div>
        <div>
          <h3 className="text-base font-bold text-white">No open jobs here yet</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
            {searchQuery
              ? `Nothing matches "${searchQuery}".`
              : location && radiusKm !== null
              ? `No open jobs within ${radiusKm} km of ${location.label}. Try a larger distance.`
              : 'New jobs appear here the moment they are posted.'}
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {location && radiusKm !== null && radiusKm < 50 && (
            <button onClick={() => setRadiusKm(radiusKm < 10 ? 10 : radiusKm < 25 ? 25 : 50)} className="px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-semibold">
              Search wider
            </button>
          )}
          <button
            onClick={onNavigateToPostJob}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs"
          >
            <PlusCircle className="w-4 h-4" /> Post a job
          </button>
        </div>
      </div>
    );
  }

  function renderActions(job: Job, compact = false) {
    const isMyJob = user?.id === job.poster_id;
    const busy = quickBusyId === job.id;

    if (isMyJob) {
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelectJob(job.id);
          }}
          className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-slate-200"
        >
          Your job{typeof job.offer_count === 'number' ? ` · ${job.offer_count} offer${job.offer_count === 1 ? '' : 's'}` : ''}
        </button>
      );
    }

    if (job.my_offer?.status === 'pending') {
      return (
        <button
          onClick={(e) => openOfferModal(job, e)}
          className="px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs font-bold flex items-center gap-1.5"
          title="Change your offer"
        >
          <Hourglass className="w-3.5 h-3.5" /> Your offer {formatMoney(job.my_offer.price)}
        </button>
      );
    }
    if (job.my_offer?.status === 'declined') {
      return <span className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-slate-500">Offer declined</span>;
    }

    if (needsId(job.category_slug)) {
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            goToProfile();
          }}
          className="px-3 py-2 rounded-xl bg-sky-500/15 border border-sky-500/40 text-sky-200 text-xs font-bold flex items-center gap-1.5"
          title="Babysitting and care jobs need a verified ID"
        >
          <BadgeCheck className="w-3.5 h-3.5" /> Verify ID to offer
        </button>
      );
    }

    return (
      <div className="flex items-center gap-1.5">
        {job.budget !== null && (
          <button
            onClick={(e) => handleQuickAccept(job, e)}
            disabled={busy}
            className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1 disabled:opacity-50"
          >
            {busy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            {compact ? formatMoney(job.budget) : `Accept ${formatMoney(job.budget)}`}
          </button>
        )}
        <button
          onClick={(e) => openOfferModal(job, e)}
          className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 ${
            job.budget === null ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950' : 'bg-slate-800 hover:bg-slate-700 text-white'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          {job.budget === null ? 'Make offer' : compact ? 'Offer' : 'Your price'}
        </button>
      </div>
    );
  }

  function renderJobCard(job: Job) {
    const isActive = activeJobId === job.id;
    const distance = formatDistance(job.distance_km);

    return (
      <article
        key={job.id}
        onClick={() => {
          sound.playTap();
          setActiveJobId(job.id);
          onSelectJob(job.id);
        }}
        className={`group p-5 rounded-3xl bg-slate-900/80 border flex flex-col justify-between gap-4 cursor-pointer shadow-lg ${
          isActive ? 'border-amber-400 ring-2 ring-amber-400/20' : 'border-slate-800/90 hover:border-emerald-500/50'
        }`}
      >
        {job.photos && job.photos.length > 0 && (
          <div className="relative -mx-5 -mt-5 mb-1 h-36 overflow-hidden rounded-t-3xl bg-slate-950">
            <img src={job.photos[0].url} alt="" loading="lazy" className="w-full h-full object-cover" />
            {job.photos.length > 1 && (
              <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-lg bg-slate-950/80 text-[10px] font-bold text-white">
                +{job.photos.length - 1} photo{job.photos.length > 2 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        <div className="flex items-start justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            {job.category_name}
          </span>
          <div className="text-right">
            <div className="text-base font-black text-white">{formatMoney(job.budget) ?? 'Open to offers'}</div>
            {distance && <div className="text-[11px] font-bold text-sky-300">{distance} away</div>}
          </div>
        </div>

        <div>
          <h3 className="text-base font-extrabold text-white group-hover:text-emerald-300 line-clamp-1">{job.title}</h3>
          <p className="text-xs text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">{job.description || 'No additional details provided.'}</p>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-semibold flex-wrap">
          <span className={`flex items-center gap-1 ${job.scheduled_for ? 'text-sky-300' : 'text-amber-300'}`}>
            <CalendarClock className="w-3.5 h-3.5" /> {formatSchedule(job.scheduled_for)}
          </span>
          <span className="flex items-center gap-1 text-slate-400">
            <Wallet className="w-3.5 h-3.5" /> {paymentLabel(job.payment_method)}
          </span>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/60">
          <div className="flex items-center gap-1.5 truncate max-w-[65%]">
            <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="truncate">{job.location_text}</span>
          </div>
          <div className="flex items-center gap-1 text-slate-500 shrink-0">
            <Clock className="w-3 h-3" />
            <span>{relativeTime(job.created_at)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar name={job.poster.name} url={job.poster.avatar_url} size="sm" />
            <div className="min-w-0">
              <span className="text-xs font-bold text-slate-200 block truncate">{job.poster.name}</span>
              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                <span className="font-bold text-slate-300">{Number(job.poster.rating_avg).toFixed(1)}</span>
                <span>({job.poster.rating_count})</span>
              </div>
            </div>
          </div>
          {renderActions(job)}
        </div>
      </article>
    );
  }

  function renderCompactJobRow(job: Job) {
    const distance = formatDistance(job.distance_km);
    return (
      <article
        key={job.id}
        onClick={() => onSelectJob(job.id)}
        className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-white truncate">{job.title}</span>
            <span className="text-[10px] font-semibold text-emerald-400 px-2 bg-emerald-500/10 rounded-md border border-emerald-500/20 shrink-0">
              {job.category_name}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5 flex-wrap">
            {distance && <span className="text-sky-300 font-bold">{distance}</span>}
            <span>{job.location_text}</span>
            <span>· {formatSchedule(job.scheduled_for)}</span>
            <span>· {job.poster.name} ★ {Number(job.poster.rating_avg).toFixed(1)}</span>
            <span>· {relativeTime(job.created_at)}</span>
          </div>
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
          <span className="font-black text-sm text-white">{formatMoney(job.budget) ?? 'Open to offers'}</span>
          {renderActions(job, true)}
        </div>
      </article>
    );
  }
};
