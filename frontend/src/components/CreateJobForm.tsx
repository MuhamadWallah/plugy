import React, { useState } from 'react';
import { 
  Sparkles, 
  Shirt, 
  Leaf, 
  Car, 
  HeartHandshake, 
  Baby, 
  DollarSign, 
  MapPin, 
  Type, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  PlusCircle, 
  Lock,
  ArrowRight,
  RotateCcw
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface CreatedJob {
  id: string;
  title: string;
  category_slug: string;
  category_name?: string;
  description: string;
  location_text: string;
  budget: number | null;
  status: string;
  created_at: string;
}

interface CreateJobFormProps {
  onJobCreated?: (job: CreatedJob) => void;
  onRequireAuth?: () => void;
}

export const CreateJobForm: React.FC<CreateJobFormProps> = ({ onJobCreated, onRequireAuth }) => {
  const { user } = useAuth();

  const categories = [
    { slug: 'cleaning', name: 'Cleaning', icon: Sparkles, color: 'from-amber-400 to-orange-500', desc: 'Home, apartment, turnover' },
    { slug: 'ironing', name: 'Ironing', icon: Shirt, color: 'from-sky-400 to-blue-600', desc: 'Pressing, laundry, folding' },
    { slug: 'gardening', name: 'Gardening', icon: Leaf, color: 'from-emerald-400 to-green-600', desc: 'Lawn mowing, weeding, care' },
    { slug: 'car_wash', name: 'Car Washing', icon: Car, color: 'from-cyan-400 to-teal-600', desc: 'Exterior wash, detailing' },
    { slug: 'care_taking', name: 'Care Taking', icon: HeartHandshake, color: 'from-rose-400 to-pink-600', desc: 'Elderly assistance, sitting' },
    { slug: 'babysitting', name: 'Babysitting', icon: Baby, color: 'from-purple-400 to-indigo-600', desc: 'Childcare, playtime, care' },
  ];

  const [category, setCategory] = useState<string>('cleaning');
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [locationText, setLocationText] = useState<string>('');
  const [budget, setBudget] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successJob, setSuccessJob] = useState<CreatedJob | null>(null);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setLocationText('');
    setBudget('');
    setError(null);
  };

  const handleFillSample = () => {
    const samples = [
      {
        cat: 'cleaning',
        title: 'Apartment Deep Clean (Kitchen & 2 Baths)',
        desc: 'Need floors scrubbed, oven cleaned, and tile grout done. Cleaning supplies and mop are available in unit.',
        loc: 'Downtown, 4th Ave & Elm St',
        bud: '75',
      },
      {
        cat: 'gardening',
        title: 'Front Lawn Mowing & Bush Trimming',
        desc: 'Approx 300 sq meters front yard. Grass mower is in garden shed. Please bag cuttings.',
        loc: 'North Park Suburb, Oak Lane #12',
        bud: '50',
      },
      {
        cat: 'car_wash',
        title: 'SUV Foam Wash & Interior Vacuuming',
        desc: 'Outdoor driveway wash. Garden hose and pressure washer available. Water and electricity provided.',
        loc: 'Eastridge Residences, Bay 4',
        bud: '40',
      },
    ];
    const s = samples[Math.floor(Math.random() * samples.length)];
    setCategory(s.cat);
    setTitle(s.title);
    setDescription(s.desc);
    setLocationText(s.loc);
    setBudget(s.bud);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user) {
      if (onRequireAuth) onRequireAuth();
      return;
    }

    if (!title.trim()) {
      setError('Please provide a job title.');
      return;
    }

    if (!category) {
      setError('Please select a service category.');
      return;
    }

    if (description.length > 1000) {
      setError('Description cannot exceed 1000 characters.');
      return;
    }

    let parsedBudget: number | null = null;
    if (budget.trim() !== '') {
      parsedBudget = parseFloat(budget);
      if (isNaN(parsedBudget) || parsedBudget <= 0) {
        setError('Budget must be a positive number, or leave blank for negotiable.');
        return;
      }
    }

    setLoading(true);

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          title: title.trim(),
          category,
          description: description.trim(),
          location_text: locationText.trim() || 'Local area',
          budget: parsedBudget,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to post job');
      }

      setSuccessJob(data.job);
      resetForm();
      if (onJobCreated) {
        onJobCreated(data.job);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error posting job');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-800/80 gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
            <PlusCircle className="w-3.5 h-3.5" />
            New Service Request
          </div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight">Post a Small Job</h2>
          <p className="text-xs text-slate-400 mt-1">
            Specify what you need done. Local workers nearby can review and accept it immediately.
          </p>
        </div>

        {user && (
          <button
            type="button"
            onClick={handleFillSample}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition cursor-pointer self-start sm:self-auto"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            Fill Sample Job
          </button>
        )}
      </div>

      {/* Success Notification Banner */}
      {successJob && (
        <div className="my-6 p-5 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-200 shadow-xl space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-bold">
                <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Job Successfully Posted!</h4>
                <p className="text-xs text-emerald-300/80">
                  Status: <span className="uppercase font-semibold tracking-wider text-emerald-400">Open</span> &bull; ID: <span className="font-mono text-[11px]">{successJob.id.slice(0, 8)}...</span>
                </p>
              </div>
            </div>
            <button
              onClick={() => setSuccessJob(null)}
              className="text-xs text-slate-400 hover:text-white transition cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-emerald-500/20 text-xs text-slate-300 space-y-1">
            <div className="font-semibold text-white text-sm">{successJob.title}</div>
            <div className="flex items-center gap-3 text-slate-400">
              <span className="capitalize text-emerald-400 font-medium">#{successJob.category_slug}</span>
              <span>&bull;</span>
              <span>{successJob.location_text}</span>
              <span>&bull;</span>
              <span className="text-white font-semibold">
                {successJob.budget !== null ? `$${Number(successJob.budget).toFixed(2)}` : 'Negotiable'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => setSuccessJob(null)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5 stroke-[2.5]" />
              Post Another Job
            </button>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="my-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
          <div className="flex-1">{error}</div>
        </div>
      )}

      {/* Auth Guard Banner if Logged Out */}
      {!user && (
        <div className="my-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>You must be signed in to publish a job request.</span>
          </div>
          <button
            type="button"
            onClick={onRequireAuth}
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer"
          >
            Sign In Now
          </button>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-6 mt-6">
        {/* Category Picker - Selectable Cards (NOT a dropdown) */}
        <div>
          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5">
            1. Select Category *
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isSelected = category === cat.slug;
              return (
                <button
                  type="button"
                  key={cat.slug}
                  onClick={() => setCategory(cat.slug)}
                  className={`p-3.5 rounded-2xl border text-left transition-all duration-150 flex flex-col justify-between cursor-pointer group relative overflow-hidden ${
                    isSelected
                      ? 'bg-emerald-500/10 border-emerald-500 text-white shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-950/90'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                        isSelected
                          ? `bg-gradient-to-br ${cat.color} text-slate-950 shadow-md`
                          : 'bg-slate-900 text-slate-400 group-hover:text-slate-200'
                      }`}
                    >
                      <Icon className="w-4 h-4 stroke-[2.2]" />
                    </div>
                    {isSelected && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    )}
                  </div>
                  <div>
                    <div className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                      {cat.name}
                    </div>
                    <div className="text-[10px] text-slate-500 leading-tight mt-0.5">
                      {cat.desc}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Title Field */}
        <div>
          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
            2. Job Title *
          </label>
          <div className="relative">
            <Type className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 3-bedroom apartment floor scrubbing & bathroom cleaning"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-sm text-white placeholder-slate-500 outline-none transition"
            />
          </div>
        </div>

        {/* Description Field */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
              3. Description
            </label>
            <span className={`text-[10px] font-mono ${description.length > 900 ? 'text-amber-400' : 'text-slate-500'}`}>
              {description.length} / 1000 characters
            </span>
          </div>
          <div className="relative">
            <FileText className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
            <textarea
              rows={3}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what needs to be done, specific requirements, tools available, or timing..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-sm text-white placeholder-slate-500 outline-none transition resize-y min-h-[90px]"
            />
          </div>
        </div>

        {/* Location & Budget Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Location */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              4. Location / Area *
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                maxLength={255}
                value={locationText}
                onChange={(e) => setLocationText(e.target.value)}
                placeholder="e.g. Downtown, 5th & Pine Ave"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-sm text-white placeholder-slate-500 outline-none transition"
              />
            </div>
          </div>

          {/* Budget */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                5. Budget ($ USD)
              </label>
              <span className="text-[10px] text-slate-500 font-normal">Optional / Negotiable</span>
            </div>
            <div className="relative">
              <DollarSign className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="number"
                min="1"
                step="any"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="e.g. 50 (leave empty for negotiable)"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-sm text-white placeholder-slate-500 outline-none transition"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
          <button
            type="submit"
            disabled={loading || !user}
            className="w-full sm:flex-1 py-3 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                Publish Job to Live Board
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={resetForm}
            className="w-full sm:w-auto py-3 px-4 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Clear Form
          </button>
        </div>
      </form>
    </div>
  );
};
