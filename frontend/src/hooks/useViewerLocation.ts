import { useCallback, useState } from 'react';
import { LatLng, getCurrentPosition, reverseGeocode } from '../utils/geo';

export interface ViewerLocation extends LatLng {
  label: string;
  source: 'gps' | 'search';
}

const STORAGE_KEY = 'plugy_viewer_location';

const readStored = (): ViewerLocation | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.lat === 'number' && typeof parsed?.lng === 'number') return parsed;
  } catch {
    // storage unavailable or corrupt
  }
  return null;
};

const store = (loc: ViewerLocation | null) => {
  try {
    if (loc) localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};

/**
 * Where the viewer is browsing jobs from: GPS or a searched area, remembered on this device.
 */
export const useViewerLocation = () => {
  const [location, setLocationState] = useState<ViewerLocation | null>(readStored);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setLocation = useCallback((loc: ViewerLocation | null) => {
    setLocationState(loc);
    store(loc);
  }, []);

  const locate = useCallback(async () => {
    setLocating(true);
    setError(null);
    try {
      const pos = await getCurrentPosition();
      const provisional: ViewerLocation = { lat: pos.lat, lng: pos.lng, label: 'Your location', source: 'gps' };
      setLocation(provisional);
      const label = await reverseGeocode(pos);
      if (label) setLocation({ ...provisional, label });
      return provisional;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get your location');
      return null;
    } finally {
      setLocating(false);
    }
  }, [setLocation]);

  return { location, setLocation, locate, locating, error, clearError: () => setError(null) };
};
