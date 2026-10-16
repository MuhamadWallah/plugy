let currency = 'USD';
// narrowSymbol: "$20.00" / "R20.00" everywhere, instead of locale variants like "US$20.00"
const options = (code: string, short = false): Intl.NumberFormatOptions => ({
  style: 'currency',
  currency: code,
  currencyDisplay: 'narrowSymbol',
  ...(short ? { maximumFractionDigits: 0, minimumFractionDigits: 0 } : {}),
});
let fullFormat = new Intl.NumberFormat(undefined, options(currency));
let shortFormat = new Intl.NumberFormat(undefined, options(currency, true));

/** Sets the marketplace currency (ISO 4217 code from the server config) */
export const setCurrency = (code: string | undefined) => {
  if (!code || code === currency) return;
  try {
    fullFormat = new Intl.NumberFormat(undefined, options(code));
    shortFormat = new Intl.NumberFormat(undefined, options(code, true));
    currency = code;
  } catch {
    // unknown code: keep the previous currency
  }
};

/** "$25.00" in the marketplace currency */
export const formatMoney = (value: string | number | null | undefined): string | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? fullFormat.format(n) : null;
};

/** "$25" (whole units) for compact places like map pins and quick-pick chips */
export const formatMoneyShort = (value: string | number): string => shortFormat.format(Math.round(Number(value)));

export const formatDistance = (km: number | null | undefined): string | null => {
  if (km === null || km === undefined || !Number.isFinite(km)) return null;
  if (km < 1) return `${Math.max(100, Math.round((km * 1000) / 100) * 100)} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
};

export const ETA_OPTIONS: { value: number; label: string }[] = [
  { value: 15, label: 'In 15 min' },
  { value: 30, label: 'In 30 min' },
  { value: 60, label: 'In 1 hour' },
  { value: 120, label: 'In 2 hours' },
  { value: 240, label: 'Later today' },
  { value: 1440, label: 'Tomorrow' },
];

export const formatEta = (minutes: number | null | undefined): string | null => {
  if (minutes === null || minutes === undefined) return null;
  const preset = ETA_OPTIONS.find((o) => o.value === minutes);
  if (preset) return preset.label;
  if (minutes < 60) return `In ${minutes} min`;
  if (minutes < 1440) return `In ${Math.round(minutes / 60)} h`;
  return `In ${Math.round(minutes / 1440)} days`;
};

export const relativeTime = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const diffSeconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSeconds < 60) return 'Just now';
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return `${Math.floor(diffSeconds / 86400)}d ago`;
};

export const memberSince = (iso: string | null | undefined): string => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
};

/**
 * Share of hires a worker completed (vs backed out). Only meaningful after a few hires,
 * so it returns null for newcomers.
 */
export const reliability = (jobsCompleted: number, backouts: number): number | null => {
  const hires = jobsCompleted + backouts;
  return hires >= 3 ? Math.round((jobsCompleted / hires) * 100) : null;
};

/** Reads `{ error }` from an API response, falling back to a generic message */
export const readApiError = async (res: Response, fallback: string): Promise<string> => {
  try {
    const data = await res.json();
    return data?.error || fallback;
  } catch {
    return fallback;
  }
};

export const PAYMENT_METHODS: { value: 'cash' | 'mobile_money' | 'bank_transfer'; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'bank_transfer', label: 'Bank transfer' },
];

export const paymentLabel = (method: string | null | undefined): string =>
  PAYMENT_METHODS.find((m) => m.value === method)?.label ?? 'Cash';

/** "As soon as possible", "Today, 14:00", "Tomorrow, 09:00" or "Sat 18 Oct, 09:00" */
export const formatSchedule = (iso: string | null | undefined): string => {
  if (!iso) return 'As soon as possible';
  const date = new Date(iso);
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(date) - startOfDay(new Date())) / 86400000);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;
  return `${date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
};
