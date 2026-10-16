import React, { useState } from 'react';
import {
  Sparkles,
  Shirt,
  Leaf,
  Car,
  HeartHandshake,
  Baby,
  Banknote,
  MapPin,
  Type,
  FileText,
  AlertCircle,
  Lock,
  ArrowRight,
  RotateCcw,
  Eye,
  Clock,
  Star,
  LocateFixed,
  RefreshCw,
  Search,
  Users,
  Handshake,
  TrendingUp,
  CalendarClock,
  Wallet,
  ImagePlus,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Job, PaymentMethod } from '../types/marketplace';
import { PAYMENT_METHODS, formatMoney, formatMoneyShort, formatSchedule, paymentLabel } from '../utils/format';
import { LatLng, PlaceResult, getCurrentPosition, reverseGeocode, searchPlaces } from '../utils/geo';
import { requestNotificationPermission } from '../utils/notify';
import { MapView } from './MapView';
import { shrinkImage, uploadImages } from '../utils/image';
import { MAX_JOB_PHOTOS } from './JobPhotoGallery';
import { sound } from '../utils/sound';

interface CreateJobFormProps {
  onJobCreated?: (job: Job) => void;
  onRequireAuth?: () => void;
}

const CATEGORIES = [
  { slug: 'cleaning', name: 'Cleaning', icon: Sparkles, color: 'from-amber-400 to-orange-500', desc: 'Home, apartment, office' },
  { slug: 'ironing', name: 'Ironing', icon: Shirt, color: 'from-sky-400 to-blue-600', desc: 'Pressing, laundry, folding' },
  { slug: 'gardening', name: 'Gardening', icon: Leaf, color: 'from-emerald-400 to-green-600', desc: 'Lawn, weeding, hedges' },
  { slug: 'car_wash', name: 'Car Washing', icon: Car, color: 'from-cyan-400 to-teal-600', desc: 'Wash, vacuum, detailing' },
  { slug: 'care_taking', name: 'Care Taking', icon: HeartHandshake, color: 'from-rose-400 to-pink-600', desc: 'Elderly care, house sitting' },
  { slug: 'babysitting', name: 'Babysitting', icon: Baby, color: 'from-purple-400 to-indigo-600', desc: 'Childcare, supervision' },
];

// Title/description starters (the location and price always come from the poster)
const TEMPLATES = [
  { label: 'Apartment clean', cat: 'cleaning', title: '2-bedroom apartment clean', desc: 'Floors, kitchen and bathroom. Cleaning supplies are available.' },
  { label: 'Car wash', cat: 'car_wash', title: 'Exterior wash and interior vacuum', desc: 'One car in the driveway. Water and hose available.' },
  { label: 'Lawn mowing', cat: 'gardening', title: 'Mow front and back lawn', desc: 'Mower available. Please collect the clippings.' },
  { label: 'Ironing', cat: 'ironing', title: 'Ironing for a week of clothes', desc: 'Iron and board ready.' },
];

const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const at = (daysAhead: number, hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d;
};

export const CreateJobForm: React.FC<CreateJobFormProps> = ({ onJobCreated, onRequireAuth }) => {
  const { user } = useAuth();

  const [category, setCategory] = useState<string>('cleaning');
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [budget, setBudget] = useState<string>('');
  const [isNegotiable, setIsNegotiable] = useState<boolean>(false);
  const [scheduledLocal, setScheduledLocal] = useState<string>(''); // '' = as soon as possible
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Location: exact pin (private until hire) + public area label
  const [pin, setPin] = useState<LatLng | null>(null);
  const [locationText, setLocationText] = useState<string>('');
  const [labelEdited, setLabelEdited] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<PlaceResult[]>([]);

  const selectedCategory = CATEGORIES.find((c) => c.slug === category) || CATEGORIES[0];

  const placePin = async (pos: LatLng, knownLabel?: string) => {
    setPin(pos);
    setGeoError(null);
    if (knownLabel && !labelEdited) {
      setLocationText(knownLabel);
      return;
    }
    if (!labelEdited) {
      const label = await reverseGeocode(pos);
      if (label) setLocationText(label);
    }
  };

  const useCurrentLocation = async () => {
    setGeoBusy(true);
    setGeoError(null);
    try {
      const pos = await getCurrentPosition();
      await placePin(pos);
    } catch (err) {
      setGeoError(err instanceof Error ? err.message : 'Could not get your location');
    } finally {
      setGeoBusy(false);
    }
  };

  const runPlaceSearch = async () => {
    if (placeQuery.trim().length < 3) return;
    setGeoBusy(true);
    setGeoError(null);
    try {
      const results = await searchPlaces(placeQuery);
      setPlaceResults(results);
      if (results.length === 0) setGeoError('No places found. Try street and city, or tap the map.');
    } catch (err) {
      setGeoError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setGeoBusy(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setBudget('');
    setIsNegotiable(false);
    setScheduledLocal('');
    setPaymentMethod('cash');
    photos.forEach((p) => URL.revokeObjectURL(p.preview));
    setPhotos([]);
    setPin(null);
    setLocationText('');
    setLabelEdited(false);
    setPlaceResults([]);
    setPlaceQuery('');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user) {
      onRequireAuth?.();
      return;
    }
    if (title.trim().length < 3) {
      setError('Please give the job a short title (at least 3 characters).');
      return;
    }
    if (!pin) {
      setError('Set where the job is: use your location, search an address, or tap the map.');
      return;
    }
    if (!locationText.trim()) {
      setError('Add an area name (e.g. suburb and city) so workers know roughly where the job is.');
      return;
    }

    let scheduledFor: string | null = null;
    if (scheduledLocal) {
      const when = new Date(scheduledLocal);
      if (Number.isNaN(when.getTime()) || when.getTime() < Date.now()) {
        setError('Choose a time in the future, or "As soon as possible".');
        return;
      }
      scheduledFor = when.toISOString();
    }

    let parsedBudget: number | null = null;
    if (!isNegotiable) {
      parsedBudget = parseFloat(budget);
      if (isNaN(parsedBudget) || parsedBudget <= 0) {
        setError('Enter the price you offer, or let workers propose a price.');
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: title.trim(),
          category,
          description: description.trim(),
          location_text: locationText.trim(),
          latitude: pin.lat,
          longitude: pin.lng,
          budget: parsedBudget,
          scheduled_for: scheduledFor,
          payment_method: paymentMethod,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const details = Array.isArray(data.details) ? '' : data.details ? Object.values(data.details).flat().join(', ') : '';
        throw new Error([data.error || 'Failed to post job', details].filter(Boolean).join(': '));
      }

      // Photos are attached after the job exists; a failed photo doesn't lose the job
      let failedPhotos = 0;
      for (let i = 0; i < photos.length; i++) {
        setUploadStatus(`Uploading photo ${i + 1} of ${photos.length}…`);
        try {
          await uploadImages(`/api/jobs/${data.job.id}/photos`, { photo: await shrinkImage(photos[i].file, 1600) });
        } catch {
          failedPhotos++;
        }
      }
      setUploadStatus(null);

      sound.playChime();
      requestNotificationPermission();
      resetForm();
      if (failedPhotos > 0) {
        window.alert(`Your job is posted, but ${failedPhotos} photo(s) couldn't be uploaded. You can add them from the job screen.`);
      }
      onJobCreated?.(data.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error posting job');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      <div className="p-4 rounded-3xl bg-slate-900/80 border border-slate-800/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <span className="text-xs font-bold text-white flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400" /> Start from an example:
        </span>
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto scrollbar-none">
          {TEMPLATES.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => {
                setCategory(t.cat);
                setTitle(t.title);
                setDescription(t.desc);
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 whitespace-nowrap"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {!user && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <Lock className="w-4 h-4 shrink-0" /> Sign in to post a job.
          </span>
          <button type="button" onClick={onRequireAuth} className="px-3.5 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs">
            Sign in
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form onSubmit={handleSubmit} className="lg:col-span-7 bg-slate-900/80 border border-slate-800/80 rounded-3xl p-5 sm:p-7 space-y-6" noValidate>
          {/* 1. Category */}
          <fieldset>
            <legend className="block text-xs font-black text-slate-300 uppercase tracking-wider mb-2.5">1. What do you need?</legend>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isSelected = category === cat.slug;
                return (
                  <button
                    type="button"
                    key={cat.slug}
                    onClick={() => setCategory(cat.slug)}
                    aria-pressed={isSelected}
                    className={`p-3 rounded-2xl border text-left ${
                      isSelected ? 'bg-emerald-500/15 border-emerald-500 ring-2 ring-emerald-500/40' : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2 ${isSelected ? `bg-gradient-to-br ${cat.color} text-slate-950` : 'bg-slate-900 text-slate-400'}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-300'}`}>{cat.name}</div>
                    <div className="text-[10px] text-slate-500 leading-tight mt-0.5">{cat.desc}</div>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* 2. Title */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="job-title" className="text-xs font-black text-slate-300 uppercase tracking-wider">2. Title</label>
              <span className="text-[10px] font-mono text-slate-500">{title.length} / 120</span>
            </div>
            <div className="relative">
              <Type className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="job-title"
                type="text"
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Clean a 3-bedroom house"
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-950/80 border border-slate-800 focus:border-emerald-500 text-sm text-white placeholder-slate-500 outline-none"
              />
            </div>
          </div>

          {/* 3. Description */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="job-description" className="text-xs font-black text-slate-300 uppercase tracking-wider">3. Details</label>
              <span className="text-[10px] font-mono text-slate-500">{description.length} / 1000</span>
            </div>
            <div className="relative">
              <FileText className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <textarea
                id="job-description"
                rows={3}
                maxLength={1000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Size of the job, tools available, when you need it done..."
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-950/80 border border-slate-800 focus:border-emerald-500 text-sm text-white placeholder-slate-500 outline-none resize-y min-h-[90px]"
              />
            </div>
          </div>

          {/* 4. Location */}
          <fieldset className="space-y-2.5">
            <legend className="block text-xs font-black text-slate-300 uppercase tracking-wider mb-1">4. Where is the job?</legend>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={useCurrentLocation}
                disabled={geoBusy}
                className="px-4 py-2.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {geoBusy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
                Use my current location
              </button>
              <div className="flex gap-2 flex-1">
                <input
                  value={placeQuery}
                  onChange={(e) => setPlaceQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      runPlaceSearch();
                    }
                  }}
                  placeholder="Or search an address"
                  aria-label="Search an address"
                  className="flex-1 min-w-0 px-3.5 py-2.5 rounded-2xl bg-slate-950/80 border border-slate-800 focus:border-emerald-500 text-sm text-white placeholder-slate-500 outline-none"
                />
                <button
                  type="button"
                  onClick={runPlaceSearch}
                  disabled={geoBusy || placeQuery.trim().length < 3}
                  className="px-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-50"
                  aria-label="Search"
                >
                  <Search className="w-4 h-4" />
                </button>
              </div>
            </div>

            {placeResults.length > 0 && (
              <ul className="rounded-2xl border border-slate-800 divide-y divide-slate-800 overflow-hidden">
                {placeResults.map((place) => (
                  <li key={`${place.lat},${place.lng}`}>
                    <button
                      type="button"
                      onClick={() => {
                        placePin(place, place.label);
                        setPlaceResults([]);
                      }}
                      className="w-full text-left px-4 py-2.5 bg-slate-950 hover:bg-slate-900"
                    >
                      <span className="text-sm font-bold text-white block">{place.label}</span>
                      <span className="text-[11px] text-slate-500 block truncate">{place.fullLabel}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {geoError && (
              <p className="text-xs text-amber-300 flex gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" /> {geoError}
              </p>
            )}

            <MapView
              markers={pin ? [{ id: 'pin', lat: pin.lat, lng: pin.lng, kind: 'pin', label: 'Job here' }] : []}
              center={pin}
              zoom={16}
              onMapClick={(pos) => placePin(pos)}
              className="h-56"
            />
            <p className="text-[11px] text-slate-500">
              {pin ? 'Tap the map to move the pin.' : 'Tap the map to drop a pin on the exact spot.'} Workers only see the approximate area (about 1 km)
              until you hire someone.
            </p>

            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                maxLength={255}
                value={locationText}
                onChange={(e) => {
                  setLocationText(e.target.value);
                  setLabelEdited(true);
                }}
                placeholder="Area shown to workers, e.g. Avondale, Harare"
                aria-label="Area name shown to workers"
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-950/80 border border-slate-800 focus:border-emerald-500 text-sm text-white placeholder-slate-500 outline-none"
              />
            </div>
          </fieldset>

          {/* Photos (optional) */}
          <fieldset className="space-y-2">
            <legend className="text-xs font-black text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <ImagePlus className="w-3.5 h-3.5 text-emerald-400" /> Photos (optional)
            </legend>
            <div className="grid grid-cols-4 gap-2">
              {photos.map((p, i) => (
                <div key={p.preview} className="relative aspect-square">
                  <img src={p.preview} alt="" className="w-full h-full object-cover rounded-xl border border-slate-800" />
                  <button
                    type="button"
                    onClick={() => {
                      URL.revokeObjectURL(p.preview);
                      setPhotos((prev) => prev.filter((_, j) => j !== i));
                    }}
                    className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-slate-950 border border-slate-700 text-slate-300"
                    aria-label={`Remove photo ${i + 1}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {photos.length < MAX_JOB_PHOTOS && (
                <label className="aspect-square rounded-xl border border-dashed border-slate-700 hover:border-emerald-500/60 text-slate-400 hover:text-emerald-300 flex flex-col items-center justify-center gap-1 text-[10px] font-bold cursor-pointer">
                  <ImagePlus className="w-5 h-5" />
                  Add photo
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    aria-label="Add job photos"
                    onChange={(e) => {
                      const picked = Array.from(e.target.files ?? []).slice(0, MAX_JOB_PHOTOS - photos.length);
                      e.target.value = '';
                      setPhotos((prev) => [...prev, ...picked.map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
                    }}
                  />
                </label>
              )}
            </div>
            <p className="text-[11px] text-slate-500">Up to {MAX_JOB_PHOTOS} photos help workers understand the job and price it right.</p>
          </fieldset>

          {/* 5. When */}
          <fieldset className="space-y-2.5">
            <legend className="text-xs font-black text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5 text-sky-400" /> 5. When do you need it?
            </legend>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'As soon as possible', value: '' },
                ...(new Date().getHours() < 16 ? [{ label: 'Today, 18:00', value: toLocalInput(at(0, 18)) }] : []),
                { label: 'Tomorrow, 09:00', value: toLocalInput(at(1, 9)) },
                { label: 'Tomorrow, 14:00', value: toLocalInput(at(1, 14)) },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setScheduledLocal(opt.value)}
                  aria-pressed={scheduledLocal === opt.value}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border ${
                    scheduledLocal === opt.value ? 'bg-sky-500 text-slate-950 border-sky-400' : 'bg-slate-950 text-slate-300 border-slate-800 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              Or pick a date and time:
              <input
                type="datetime-local"
                value={scheduledLocal}
                min={toLocalInput(new Date())}
                onChange={(e) => setScheduledLocal(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 focus:border-sky-500 text-sm text-white outline-none [color-scheme:dark]"
              />
            </label>
          </fieldset>

          {/* 6. Price & payment */}
          <fieldset className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <legend className="text-xs font-black text-slate-300 uppercase tracking-wider">6. Your price</legend>
              <button
                type="button"
                onClick={() => setIsNegotiable(!isNegotiable)}
                aria-pressed={isNegotiable}
                className={`px-3 py-1 rounded-xl text-[11px] font-bold border ${
                  isNegotiable ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                {isNegotiable ? '✓ Workers propose a price' : 'Let workers propose a price'}
              </button>
            </div>
            {isNegotiable ? (
              <p className="text-xs text-slate-400">Workers will send you their price. You choose the offer you like.</p>
            ) : (
              <>
                <div className="relative">
                  <Banknote className="w-4 h-4 text-emerald-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    inputMode="decimal"
                    min="1"
                    step="any"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="What you're willing to pay"
                    aria-label="Your price"
                    className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-900 border border-slate-800 focus:border-emerald-500 text-sm text-white placeholder-slate-500 outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  {['10', '20', '30', '50', '80'].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setBudget(amt)}
                      className={`flex-1 py-1 rounded-xl text-xs font-semibold border ${
                        budget === amt ? 'bg-emerald-500 text-slate-950 border-emerald-400' : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      {formatMoneyShort(amt)}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500">Workers can accept this price or offer theirs. You can raise it later if nobody responds.</p>
              </>
            )}
            <div className="pt-2 border-t border-slate-800/80">
              <p className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-emerald-400" /> How will you pay the worker?
              </p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Payment method">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    role="radio"
                    aria-checked={paymentMethod === m.value}
                    onClick={() => setPaymentMethod(m.value)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${
                      paymentMethod === m.value ? 'bg-emerald-500 text-slate-950 border-emerald-400' : 'bg-slate-900 text-slate-300 border-slate-800 hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-2">You pay the worker directly when the job is done.</p>
            </div>
          </fieldset>

          {error && (
            <div role="alert" className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              type="submit"
              disabled={loading || !user}
              className="w-full sm:flex-1 py-3 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> {uploadStatus}
                </>
              ) : (
                <>Post job and get offers <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="w-full sm:w-auto py-3 px-4 rounded-2xl bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
        </form>

        {/* Preview + how it works */}
        <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-20">
          <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5 px-1">
            <Eye className="w-3.5 h-3.5 text-emerald-400" /> How workers will see it
          </span>
          <div className="p-5 rounded-3xl bg-slate-900/95 border border-emerald-500/30 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <span className="px-3 py-1 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {selectedCategory.name}
              </span>
              <span className="text-base font-black text-white">
                {isNegotiable || !budget ? 'Open to offers' : formatMoney(budget)}
              </span>
            </div>
            <div>
              <h3 className="text-lg font-black text-white break-words">{title.trim() || 'Your job title'}</h3>
              <p className="text-xs text-slate-400 mt-1.5 line-clamp-3">{description.trim() || 'Details appear here as you type.'}</p>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/80">
              <span className="flex items-center gap-1.5 truncate"><MapPin className="w-3.5 h-3.5 shrink-0" />{locationText.trim() || 'Area not set'}</span>
              <span className="flex items-center gap-1 shrink-0"><Clock className="w-3 h-3" /> Just now</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span className="flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5 text-sky-400" />{formatSchedule(scheduledLocal ? new Date(scheduledLocal).toISOString() : null)}</span>
              <span className="flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5 text-emerald-400" />{paymentLabel(paymentMethod)}</span>
            </div>
            <div className="flex items-center gap-2.5 pt-3 border-t border-slate-800/80">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 font-black flex items-center justify-center text-xs">
                {user ? user.name.charAt(0).toUpperCase() : '?'}
              </div>
              <div className="text-xs">
                <span className="font-bold text-white block">{user ? user.name : 'You'}</span>
                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                  {user ? Number(user.rating_avg).toFixed(1) : '0.0'} ({user ? user.rating_count : 0} reviews)
                </span>
              </div>
            </div>
          </div>

          <ol className="p-4 rounded-3xl bg-slate-900/60 border border-slate-800/80 space-y-3 text-xs text-slate-300">
            <li className="flex gap-3"><Users className="w-4 h-4 text-emerald-400 shrink-0" /> Nearby workers accept your price or offer their own, with when they can arrive.</li>
            <li className="flex gap-3"><Handshake className="w-4 h-4 text-sky-400 shrink-0" /> You compare offers, ratings and reviews, then hire the one you want.</li>
            <li className="flex gap-3"><TrendingUp className="w-4 h-4 text-amber-400 shrink-0" /> No offers yet? Raise your price from the job screen.</li>
          </ol>
        </div>
      </div>
    </div>
  );
};
