import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { getCurrentPosition } from '../utils/geo';
import { readApiError } from '../utils/format';

export interface Availability {
  available: boolean;
  categories: string[];
  radius_km: number;
  location_label: string | null;
  available_until: string | null;
  has_location: boolean;
}

export interface GoOnlineSettings {
  categories: string[];
  radius_km: number;
  hours: number;
  latitude: number;
  longitude: number;
  location_label: string;
  /** Keep the position fresh from GPS while Plugy is open */
  followGps: boolean;
}

interface AvailabilityContextType {
  availability: Availability | null;
  goOnline: (settings: GoOnlineSettings) => Promise<void>;
  goOffline: () => Promise<void>;
}

const AvailabilityContext = createContext<AvailabilityContextType>({
  availability: null,
  goOnline: async () => {},
  goOffline: async () => {},
});

const FOLLOW_GPS_KEY = 'plugy_online_follow_gps';
const HEARTBEAT_MS = 5 * 60 * 1000;

const put = async (body: Record<string, unknown>): Promise<Availability> => {
  const res = await fetch('/api/workers/me/availability', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readApiError(res, 'Could not update your availability'));
  return (await res.json()).availability;
};

/**
 * Worker "online" state: which work they take, where and until when. While online and Plugy is
 * open, the position is refreshed from GPS every few minutes (if the worker chose GPS), and the
 * state flips to offline when the time window ends.
 */
export const AvailabilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [availability, setAvailability] = useState<Availability | null>(null);
  const settingsRef = useRef<Omit<GoOnlineSettings, 'latitude' | 'longitude' | 'followGps'> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/workers/me/availability', { credentials: 'include' });
      if (res.ok) setAvailability((await res.json()).availability);
    } catch {
      // keep previous state
    }
  }, []);

  useEffect(() => {
    if (user) load();
    else setAvailability(null);
  }, [user, load]);

  const goOnline = useCallback(async (s: GoOnlineSettings) => {
    const next = await put({
      available: true,
      categories: s.categories,
      radius_km: s.radius_km,
      hours: s.hours,
      latitude: s.latitude,
      longitude: s.longitude,
      location_label: s.location_label,
    });
    settingsRef.current = { categories: s.categories, radius_km: s.radius_km, hours: s.hours, location_label: s.location_label };
    try {
      localStorage.setItem(FOLLOW_GPS_KEY, s.followGps ? '1' : '0');
    } catch {
      // ignore
    }
    setAvailability(next);
  }, []);

  const goOffline = useCallback(async () => {
    setAvailability(await put({ available: false }));
  }, []);

  // Flip to offline in the UI when the window ends
  useEffect(() => {
    if (!availability?.available || !availability.available_until) return;
    const ms = new Date(availability.available_until).getTime() - Date.now();
    const timer = window.setTimeout(load, Math.max(1000, ms + 1000));
    return () => window.clearTimeout(timer);
  }, [availability, load]);

  // Keep the position fresh while online (GPS only, without extending the chosen end time)
  useEffect(() => {
    if (!availability?.available) return;
    let followGps = false;
    try {
      followGps = localStorage.getItem(FOLLOW_GPS_KEY) === '1';
    } catch {
      // ignore
    }
    if (!followGps) return;

    const refresh = async () => {
      const current = availability;
      if (!current?.available || !current.available_until) return;
      try {
        const pos = await getCurrentPosition({ enableHighAccuracy: false, maximumAge: HEARTBEAT_MS, timeout: 20000 });
        const hoursLeft = Math.max(1, Math.ceil((new Date(current.available_until).getTime() - Date.now()) / 3600000));
        setAvailability(
          await put({
            available: true,
            categories: current.categories,
            radius_km: current.radius_km,
            hours: Math.min(24, hoursLeft),
            latitude: pos.lat,
            longitude: pos.lng,
            location_label: settingsRef.current?.location_label ?? current.location_label,
          })
        );
      } catch {
        // keep the last known position
      }
    };
    const timer = window.setInterval(refresh, HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [availability]);

  return <AvailabilityContext.Provider value={{ availability, goOnline, goOffline }}>{children}</AvailabilityContext.Provider>;
};

export const useAvailability = () => useContext(AvailabilityContext);
