import { useEffect, useRef, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { LatLng, describeGeoError } from '../utils/geo';

const MIN_INTERVAL_MS = 5000;

/**
 * While `active`, streams the hired worker's GPS position to the job room so the customer
 * can follow them on the map. Positions are relayed live and never stored on the server.
 */
export const useLiveLocationSharing = (jobId: string | null, active: boolean) => {
  const { socket } = useSocket();
  const [position, setPosition] = useState<(LatLng & { accuracy: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastSentRef = useRef(0);

  useEffect(() => {
    if (!active || !jobId || !socket) return;

    if (!window.isSecureContext || !('geolocation' in navigator)) {
      setError('Live location needs a secure (HTTPS) connection and a browser with location support.');
      return;
    }

    setError(null);
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setError(null);
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        setPosition(next);
        const now = Date.now();
        if (now - lastSentRef.current >= MIN_INTERVAL_MS) {
          lastSentRef.current = now;
          socket.emit('location:update', { jobId, ...next });
        }
      },
      (err) => {
        // Brief GPS dropouts (indoors, tunnels) are normal: keep watching and recover automatically.
        // Only a denied permission needs the user to act.
        setError(
          err.code === err.PERMISSION_DENIED
            ? describeGeoError(err)
            : 'Searching for GPS signal… the customer sees your last known location.'
        );
      },
      // No per-fix timeout: a stationary phone may not report new fixes for a while
      { enableHighAccuracy: true, maximumAge: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [active, jobId, socket]);

  return { position, error, sharing: active && !error };
};
