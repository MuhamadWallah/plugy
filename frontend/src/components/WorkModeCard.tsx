import React, { useState } from 'react';
import { Power, BellRing, AlertCircle, RefreshCw, LocateFixed } from 'lucide-react';
import { useAvailability } from '../context/AvailabilityContext';
import { ViewerLocation } from '../hooks/useViewerLocation';
import { CATEGORIES, categoryName } from '../utils/categories';
import { enablePushNotifications, pushSupported } from '../utils/push';
import { sound } from '../utils/sound';
import { useIdRequirement } from '../hooks/useIdRequirement';

interface WorkModeCardProps {
  location: ViewerLocation | null;
  onLocate: () => Promise<ViewerLocation | null>;
  locating: boolean;
}

const RADII = [2, 5, 10, 25];
const HOURS = [4, 8, 12];

/**
 * Worker "online" switch: choose the work you do, how far you travel and for how long, and get
 * new nearby jobs pushed to you, like going online as a driver.
 */
export const WorkModeCard: React.FC<WorkModeCardProps> = ({ location, onLocate, locating }) => {
  const { availability, goOnline, goOffline } = useAvailability();
  const needsId = useIdRequirement();
  const [editing, setEditing] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [radius, setRadius] = useState(10);
  const [hours, setHours] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!availability) return null;

  const openSetup = () => {
    sound.playTap();
    setCategories(availability.categories.length ? availability.categories : []);
    setRadius(availability.radius_km || 10);
    setError(null);
    setEditing(true);
  };

  const toggleCategory = (slug: string) =>
    setCategories((prev) => (prev.includes(slug) ? prev.filter((c) => c !== slug) : [...prev, slug]));

  const submit = async () => {
    setError(null);
    if (categories.length === 0) {
      setError('Choose at least one kind of work.');
      return;
    }
    let loc = location;
    if (!loc) loc = await onLocate();
    if (!loc) {
      setError('Share your location (or search an area above) so we know which jobs are near you.');
      return;
    }
    setBusy(true);
    try {
      // Ask now, while the user is tapping: alerts need notification permission to reach a closed app
      const pushState = pushSupported() ? await enablePushNotifications() : 'unsupported';
      await goOnline({
        categories,
        radius_km: radius,
        hours,
        latitude: loc.lat,
        longitude: loc.lng,
        // The GPS placeholder isn't a place name; the status line then says "of you"
        location_label: loc.label === 'Your location' ? '' : loc.label,
        followGps: loc.source === 'gps',
      });
      sound.playChime();
      setEditing(false);
      setNotice(
        pushState === 'enabled'
          ? null
          : "You're online, but notifications are off on this device, so you'll only see alerts while Plugy is open. Turn them on from My profile."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not go online');
    } finally {
      setBusy(false);
    }
  };

  const until = availability.available_until
    ? new Date(availability.available_until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  if (availability.available && !editing) {
    return (
      <section aria-label="Job alerts" className="p-4 rounded-3xl bg-emerald-950/50 border border-emerald-500/40 space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="relative flex w-3 h-3 shrink-0">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full w-3 h-3 bg-emerald-400" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-black text-white">You're online for job alerts</p>
              <p className="text-xs text-emerald-200/80 truncate">
                {availability.categories.map(categoryName).join(', ')} · within {availability.radius_km} km of{' '}
                {availability.location_label || 'you'}
                {until ? ` · until ${until}` : ''}
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={openSetup} className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-slate-200">
              Change
            </button>
            <button
              onClick={async () => {
                setBusy(true);
                await goOffline().catch(() => {});
                setBusy(false);
                setNotice(null);
                sound.playTap();
              }}
              disabled={busy}
              className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-slate-300 hover:text-rose-300 flex items-center gap-1.5 disabled:opacity-50"
            >
              <Power className="w-3.5 h-3.5" /> Go offline
            </button>
          </div>
        </div>
        {notice && <p className="text-[11px] text-amber-300">{notice}</p>}
      </section>
    );
  }

  if (!editing) {
    return (
      <section aria-label="Job alerts" className="p-4 rounded-3xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 shrink-0 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center justify-center">
            <BellRing className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-black text-white">Want work? Get job alerts nearby</p>
            <p className="text-xs text-slate-400">Go online and new jobs you do are sent to you, even when Plugy is closed.</p>
          </div>
        </div>
        <button onClick={openSetup} className="px-4 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center justify-center gap-2 shrink-0">
          <Power className="w-4 h-4" /> Go online
        </button>
      </section>
    );
  }

  return (
    <section aria-label="Job alert settings" className="p-4 sm:p-5 rounded-3xl bg-slate-900/90 border border-emerald-500/40 space-y-4">
      <p className="text-sm font-black text-white">Get job alerts</p>

      <fieldset>
        <legend className="text-xs font-bold text-slate-300 mb-2">What work do you do?</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const on = categories.includes(c.slug);
            return (
              <button
                key={c.slug}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggleCategory(c.slug)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${
                  on ? 'bg-emerald-500 text-slate-950 border-emerald-400' : 'bg-slate-950 text-slate-300 border-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {c.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <fieldset>
          <legend className="text-xs font-bold text-slate-300 mb-2">How far will you travel?</legend>
          <div className="flex gap-2" role="radiogroup">
            {RADII.map((km) => (
              <button
                key={km}
                type="button"
                role="radio"
                aria-checked={radius === km}
                onClick={() => setRadius(km)}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold border ${radius === km ? 'bg-sky-500 text-slate-950 border-sky-400' : 'bg-slate-950 text-slate-300 border-slate-800'}`}
              >
                {km} km
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-xs font-bold text-slate-300 mb-2">Stay online for</legend>
          <div className="flex gap-2" role="radiogroup">
            {HOURS.map((h) => (
              <button
                key={h}
                type="button"
                role="radio"
                aria-checked={hours === h}
                onClick={() => setHours(h)}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold border ${hours === h ? 'bg-sky-500 text-slate-950 border-sky-400' : 'bg-slate-950 text-slate-300 border-slate-800'}`}
              >
                {h} hours
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      {categories.some(needsId) && (
        <p className="text-xs text-sky-200">
          Alerts for {categories.filter(needsId).map(categoryName).join(' and ')} start once your ID is verified (My profile → ID verification).
        </p>
      )}

      <p className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
        {location ? (
          <>Jobs near <strong className="text-white">{location.label}</strong>{location.source === 'gps' && ' (updates as you move while Plugy is open)'}</>
        ) : (
          <>
            We need your location to find nearby jobs.
            <button type="button" onClick={onLocate} disabled={locating} className="text-sky-300 font-bold flex items-center gap-1">
              {locating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <LocateFixed className="w-3.5 h-3.5" />} Use my location
            </button>
          </>
        )}
      </p>

      {error && (
        <p role="alert" className="text-xs text-rose-300 flex gap-1.5">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </p>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={() => setEditing(false)} className="px-4 py-2.5 rounded-2xl bg-slate-800 text-slate-200 text-xs font-bold">
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="flex-1 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
          {availability.available ? 'Save' : 'Go online'}
        </button>
      </div>
    </section>
  );
};
