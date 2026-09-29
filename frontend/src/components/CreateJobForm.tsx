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
  Lock,
  ArrowRight,
  RotateCcw,
  Eye,
  Clock,
  Star,
  Zap,
  TrendingUp
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { sound } from '../utils/sound';

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

  const templatePresets = [
    {
      label: 'Apartment Deep Clean',
      cat: 'cleaning',
      title: '2-Bedroom Apartment Deep Clean & Mopping',
      desc: 'Need floors scrubbed, oven cleaned, and bathroom tile grout done. Cleaning supplies and mop available in unit.',
      loc: 'Downtown, 4th Ave & Elm St',
      bud: '75',
    },
    {
      label: 'SUV Detailing',
      cat: 'car_wash',
      title: 'Full Exterior Wash & Interior Vacuuming',
      desc: 'Driveway wash. Pressure washer and car shampoo provided. Need upholstery vacuumed and windows wiped.',
      loc: 'Westwood Suburbs, Pinecrest Bay',
      bud: '55',
    },
    {
      label: 'Lawn Mowing',
      cat: 'gardening',
      title: 'Front & Back Lawn Mowing + Edge Trimming',
      desc: 'Approx 250 sq meters lawn. Electric mower available in garage. Please bag grass clippings.',
      loc: 'North Park Gardens, Oak Lane #12',
      bud: '45',
    },
    {
      label: 'Ironing Shirts',
      cat: 'ironing',
      title: 'Ironing 15 Business Shirts & Dress Trousers',
      desc: 'Steam iron and board ready. Looking for someone with careful attention to collars and pleats.',
      loc: 'Midtown Residences, 8th Floor',
      bud: '35',
    },
  ];

  const locationPresets = ['Downtown Central', 'North Park Suburbs', 'West End District', 'East Waterfront', 'Financial District'];

  const [category, setCategory] = useState<string>('cleaning');
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [locationText, setLocationText] = useState<string>('');
  const [budget, setBudget] = useState<string>('');
  const [isNegotiable, setIsNegotiable] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successJob, setSuccessJob] = useState<CreatedJob | null>(null);

  const resetForm = () => {
    sound.playTap();
    setTitle('');
    setDescription('');
    setLocationText('');
    setBudget('');
    setIsNegotiable(false);
    setError(null);
  };

  const handleApplyTemplate = (t: typeof templatePresets[0]) => {
    sound.playTap();
    setCategory(t.cat);
    setTitle(t.title);
    setDescription(t.desc);
    setLocationText(t.loc);
    setBudget(t.bud);
    setIsNegotiable(false);
    setError(null);
  };

  const selectedCategoryObj = categories.find((c) => c.slug === category) || categories[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user) {
      sound.playTap();
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
    if (!isNegotiable && budget.trim() !== '') {
      parsedBudget = parseFloat(budget);
      if (isNaN(parsedBudget) || parsedBudget <= 0) {
        setError('Budget must be a positive number, or check Negotiable.');
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

      sound.playChime();
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
    <div className="w-full space-y-6">
      {/* Top Banner: One-Click Template Presets */}
      <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/80 border border-slate-800/80 shadow-xl backdrop-blur-md flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold text-white">Quick Templates:</span>
          <span className="text-xs text-slate-400 hidden sm:inline">Click to prefill realistic requests</span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none">
          {templatePresets.map((t, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleApplyTemplate(t)}
              className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer whitespace-nowrap"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Success Notification Banner */}
      {successJob && (
        <div className="p-5 rounded-3xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 shadow-2xl space-y-3 animate-in slide-in-from-top-3 duration-200">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-slate-950 flex items-center justify-center font-black shadow-lg shadow-emerald-500/30">
                <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
              </div>
              <div>
                <h4 className="text-base font-extrabold text-white">Job Successfully Published!</h4>
                <p className="text-xs text-emerald-300/80">
                  Status: <span className="uppercase font-bold tracking-wider text-emerald-400">Open on Live Board</span> &bull; ID: <span className="font-mono text-[11px]">{successJob.id.slice(0, 8)}...</span>
                </p>
              </div>
            </div>
            <button
              onClick={() => setSuccessJob(null)}
              className="p-1 rounded-xl text-slate-400 hover:text-white text-xs cursor-pointer hover:bg-slate-900"
            >
              ✕
            </button>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/80 border border-emerald-500/20 text-xs text-slate-300 flex items-center justify-between">
            <div>
              <div className="font-bold text-white text-sm">{successJob.title}</div>
              <div className="flex items-center gap-2 text-slate-400 mt-0.5">
                <span className="capitalize text-emerald-400 font-semibold">{successJob.category_slug}</span>
                <span>&bull;</span>
                <span>{successJob.location_text}</span>
              </div>
            </div>
            <div className="font-black text-sm text-emerald-400">
              {successJob.budget !== null ? `$${Number(successJob.budget).toFixed(2)}` : 'Negotiable'}
            </div>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
          <div className="flex-1 font-semibold">{error}</div>
        </div>
      )}

      {/* Auth Notice if Logged Out */}
      {!user && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>You must be signed in to publish a job request to the live board.</span>
          </div>
          <button
            type="button"
            onClick={onRequireAuth}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition cursor-pointer"
          >
            Sign In Now
          </button>
        </div>
      )}

      {/* Studio Split Layout: Left Form vs Right Live Preview Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (Inputs): 7 cols */}
        <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Category Picker Cards */}
            <div>
              <label className="block text-xs font-black text-slate-300 uppercase tracking-wider mb-2.5">
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
                      onClick={() => {
                        sound.playTap();
                        setCategory(cat.slug);
                      }}
                      className={`p-3.5 rounded-2xl border text-left transition-all duration-150 flex flex-col justify-between cursor-pointer group relative overflow-hidden ${
                        isSelected
                          ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-xl shadow-emerald-500/15 ring-2 ring-emerald-500/40'
                          : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-950/90'
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

            {/* Title */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-black text-slate-300 uppercase tracking-wider">
                  2. Task Title *
                </label>
                <span className="text-[10px] font-mono text-slate-500">{title.length} / 120</span>
              </div>
              <div className="relative">
                <Type className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. 3-bedroom apartment floor scrubbing & bathroom cleaning"
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-950/80 border border-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-xs text-white placeholder-slate-500 outline-none transition"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-black text-slate-300 uppercase tracking-wider">
                  3. Description & Details
                </label>
                <span className={`text-[10px] font-mono ${description.length > 900 ? 'text-amber-400' : 'text-slate-500'}`}>
                  {description.length} / 1000
                </span>
              </div>
              <div className="relative">
                <FileText className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe tools provided, access instructions, special care notes, or timing preferences..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-950/80 border border-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-xs text-white placeholder-slate-500 outline-none transition resize-y min-h-[90px]"
                />
              </div>
            </div>

            {/* Location with Quick Presets */}
            <div>
              <label className="block text-xs font-black text-slate-300 uppercase tracking-wider mb-1.5">
                4. Location / Neighborhood *
              </label>
              <div className="relative mb-2">
                <MapPin className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  maxLength={255}
                  value={locationText}
                  onChange={(e) => setLocationText(e.target.value)}
                  placeholder="e.g. Downtown, 4th Ave & Pine St"
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-950/80 border border-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-xs text-white placeholder-slate-500 outline-none transition"
                />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-slate-500">Presets:</span>
                {locationPresets.map((loc, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setLocationText(loc);
                    }}
                    className="text-[10px] px-2 py-0.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                  >
                    {loc}
                  </button>
                ))}
              </div>
            </div>

            {/* Budget & Negotiable Toggle */}
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-black text-slate-300 uppercase tracking-wider">
                  5. Compensation / Budget ($ USD)
                </label>
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setIsNegotiable(!isNegotiable);
                  }}
                  className={`px-3 py-1 rounded-xl text-[11px] font-bold transition cursor-pointer border ${
                    isNegotiable
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  {isNegotiable ? '✓ Marked Negotiable' : 'Mark as Negotiable'}
                </button>
              </div>

              {!isNegotiable && (
                <div className="space-y-3">
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-emerald-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      min="5"
                      step="any"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      placeholder="Enter amount (e.g. 50)"
                      className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-900 border border-slate-800 focus:border-emerald-500 text-xs text-white placeholder-slate-500 outline-none transition"
                    />
                  </div>

                  {/* Quick Budget Chips */}
                  <div className="flex items-center gap-2">
                    {['25', '50', '75', '100', '150'].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setBudget(amt);
                        }}
                        className={`flex-1 py-1 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                          budget === amt
                            ? 'bg-emerald-500 text-slate-950 font-bold border-emerald-400'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              <button
                type="submit"
                disabled={loading || !user}
                className="w-full sm:flex-1 py-3 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer hover:scale-102 active:scale-98"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span>Publish Job to Live Board</span>
                    <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={resetForm}
                className="w-full sm:w-auto py-3 px-4 rounded-2xl bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            </div>
          </form>
        </div>

        {/* Right Column (Live Real-time Preview): 5 cols */}
        <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-20">
          <div className="flex items-center justify-between px-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-emerald-400" />
              Live Feed Preview
            </span>
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              Interactive Mock
            </span>
          </div>

          {/* Card Preview that updates live */}
          <div className="p-6 rounded-3xl bg-slate-900/95 border border-emerald-500/30 shadow-2xl space-y-4 backdrop-blur-xl ring-1 ring-emerald-500/20">
            {/* Top row */}
            <div className="flex items-start justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 capitalize">
                <Sparkles className="w-3.5 h-3.5" />
                {selectedCategoryObj.name}
              </span>

              <div className="flex items-center gap-1 px-3 py-1.5 rounded-2xl bg-slate-950 border border-slate-800 text-white font-black text-sm">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" />
                <span>
                  {isNegotiable || !budget ? 'Negotiable' : `$${Number(budget).toFixed(2)}`}
                </span>
              </div>
            </div>

            {/* Title & Desc */}
            <div>
              <h3 className="text-lg font-black text-white">
                {title.trim() || 'Untitled Service Request'}
              </h3>
              <p className="text-xs text-slate-400 mt-1.5 line-clamp-3 leading-relaxed">
                {description.trim() || 'Your task description and details will appear here as you type.'}
              </p>
            </div>

            {/* Location & Time */}
            <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/80">
              <div className="flex items-center gap-1.5 truncate max-w-[70%]">
                <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="truncate">{locationText.trim() || 'Location not specified'}</span>
              </div>
              <div className="flex items-center gap-1 text-slate-500 shrink-0 font-medium text-[11px]">
                <Clock className="w-3 h-3" />
                <span>Just now</span>
              </div>
            </div>

            {/* Poster Info & Preview Button */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-slate-950 font-black flex items-center justify-center text-xs shadow-md">
                  {user ? user.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <div>
                  <span className="text-xs font-bold text-white block leading-tight">
                    {user ? user.name : 'Your Name'}
                  </span>
                  <div className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                    <span>{user ? Number(user.rating_avg).toFixed(1) : '5.0'}</span>
                    <span>({user ? user.rating_count : 0} reviews)</span>
                  </div>
                </div>
              </div>

              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 font-bold text-xs border border-emerald-500/30">
                <Zap className="w-3 h-3" />
                Open Feed
              </span>
            </div>
          </div>

          {/* Dispatch Insights Box */}
          <div className="p-4 rounded-3xl bg-slate-900/60 border border-slate-800/80 space-y-2.5 text-xs text-slate-400 backdrop-blur-md">
            <div className="flex items-center gap-2 text-white font-bold">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span>Marketplace Demand Insight</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Jobs posted in <strong>{selectedCategoryObj.name}</strong> receive an average of 3 worker bids within 5 minutes. Realistic budgets close 70% faster!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
