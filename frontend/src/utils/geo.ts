export interface LatLng {
  lat: number;
  lng: number;
}

export interface PlaceResult extends LatLng {
  label: string;
  fullLabel: string;
}

/**
 * Browser GPS position with human-readable errors.
 */
export const getCurrentPosition = (options?: PositionOptions): Promise<LatLng & { accuracy: number }> =>
  new Promise((resolve, reject) => {
    if (!window.isSecureContext) {
      reject(new Error('Location access needs a secure (HTTPS) connection.'));
      return;
    }
    if (!('geolocation' in navigator)) {
      reject(new Error('This browser does not support location access.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(new Error(describeGeoError(err))),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000, ...options }
    );
  });

export const describeGeoError = (err: GeolocationPositionError): string => {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Location permission was denied. Allow location access for this site in your browser settings.';
    case err.POSITION_UNAVAILABLE:
      return 'Your location is unavailable right now. Check that location services are on.';
    case err.TIMEOUT:
      return 'Finding your location took too long. Please try again.';
    default:
      return 'Could not get your location.';
  }
};

export const haversineKm = (a: LatLng, b: LatLng): number => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** Turn-by-turn directions in the device's maps app (Google Maps handles the URL on Android, iOS and desktop) */
export const directionsUrl = (to: LatLng): string =>
  `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}`;

// ---------------------------------------------------------------------------
// Geocoding via OpenStreetMap Nominatim.
// Usage policy: at most 1 request per second and no search-as-you-type, so searches
// only run on an explicit submit and calls are spaced out below.
// https://operations.osmfoundation.org/policies/nominatim/
// ---------------------------------------------------------------------------
const NOMINATIM = 'https://nominatim.openstreetmap.org';
let lastGeocodeAt = 0;

const geocodeFetch = async (path: string) => {
  const wait = lastGeocodeAt + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeocodeAt = Date.now();

  const res = await fetch(`${NOMINATIM}${path}`, {
    headers: { 'Accept-Language': navigator.language || 'en' },
  });
  if (!res.ok) throw new Error('Address lookup is unavailable right now. Please try again shortly.');
  return res.json();
};

interface NominatimAddress {
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  quarter?: string;
  village?: string;
  hamlet?: string;
  town?: string;
  city?: string;
  municipality?: string;
  county?: string;
  state?: string;
  country?: string;
}

/**
 * Area-level label (suburb, city) that is safe to show publicly; never includes a house number.
 */
const areaLabel = (address: NominatimAddress | undefined, fallback: string): string => {
  if (!address) return fallback.split(',').slice(0, 2).join(',').trim();
  const area = address.suburb || address.neighbourhood || address.quarter || address.village || address.hamlet;
  const city = address.city || address.town || address.municipality || address.county || address.state;
  const parts = [area, city].filter((p, i, arr): p is string => !!p && arr.indexOf(p) === i);
  return parts.length > 0 ? parts.join(', ') : fallback.split(',').slice(0, 2).join(',').trim();
};

export const searchPlaces = async (queryText: string): Promise<PlaceResult[]> => {
  const q = queryText.trim();
  if (q.length < 3) return [];
  const data = (await geocodeFetch(
    `/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(q)}`
  )) as { lat: string; lon: string; display_name: string; address?: NominatimAddress }[];
  return data.map((item) => ({
    lat: Number(item.lat),
    lng: Number(item.lon),
    fullLabel: item.display_name,
    label: areaLabel(item.address, item.display_name),
  }));
};

export const reverseGeocode = async (pos: LatLng): Promise<string | null> => {
  try {
    const data = (await geocodeFetch(
      `/reverse?format=jsonv2&addressdetails=1&zoom=16&lat=${pos.lat}&lon=${pos.lng}`
    )) as { display_name?: string; address?: NominatimAddress; error?: string };
    if (data.error || !data.display_name) return null;
    return areaLabel(data.address, data.display_name);
  } catch {
    return null;
  }
};
