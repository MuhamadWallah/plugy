import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LatLng } from '../utils/geo';

export type MarkerKind = 'job' | 'job-active' | 'me' | 'worker' | 'pin';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  kind: MarkerKind;
  /** Short text shown on the pin (e.g. a price) */
  label?: string;
  /** Accessible name / hover text */
  title?: string;
}

export interface MapCircle {
  center: LatLng;
  radiusMeters: number;
  tone: 'radius' | 'approx';
}

interface MapViewProps {
  markers: MapMarker[];
  circles?: MapCircle[];
  /** Initial / controlled center. Changing it re-centers the map. */
  center?: LatLng | null;
  zoom?: number;
  /** Fit the view to all markers whenever the set of marker ids changes */
  fitToMarkers?: boolean;
  onMarkerClick?: (id: string) => void;
  onMapClick?: (pos: LatLng) => void;
  className?: string;
}

const DEFAULT_CENTER: LatLng = { lat: 0, lng: 20 };

const buildIcon = (marker: MapMarker): L.DivIcon => {
  const root = document.createElement('div');
  root.className = `plugy-marker plugy-marker--${marker.kind}`;

  const dot = document.createElement('span');
  dot.className = 'plugy-marker__dot';
  root.appendChild(dot);

  if (marker.label) {
    const label = document.createElement('span');
    label.className = 'plugy-marker__label';
    label.textContent = marker.label; // textContent: user content is never parsed as HTML
    root.appendChild(label);
  }

  return L.divIcon({
    html: root,
    className: 'plugy-marker-wrapper',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
};

/**
 * OpenStreetMap map (Leaflet) with simple declarative markers and circles.
 */
export const MapView: React.FC<MapViewProps> = ({
  markers,
  circles = [],
  center,
  zoom = 13,
  fitToMarkers = false,
  onMarkerClick,
  onMapClick,
  className = 'h-72',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const fittedKeyRef = useRef<string>('');
  const markerClickRef = useRef(onMarkerClick);
  const mapClickRef = useRef(onMapClick);
  markerClickRef.current = onMarkerClick;
  mapClickRef.current = onMapClick;

  // Create the map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const start = center ?? DEFAULT_CENTER;
    const map = L.map(containerRef.current, {
      center: [start.lat, start.lng],
      zoom: center ? zoom : 2,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      mapClickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Containers inside modals/animated panels get their final size after mount
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-center when the requested center changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    map.setView([center.lat, center.lng], Math.max(map.getZoom(), zoom), { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.lat, center?.lng]);

  // Redraw markers and circles
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    for (const circle of circles) {
      L.circle([circle.center.lat, circle.center.lng], {
        radius: circle.radiusMeters,
        className: `plugy-circle plugy-circle--${circle.tone}`,
        interactive: false,
      }).addTo(layer);
    }

    for (const marker of markers) {
      const m = L.marker([marker.lat, marker.lng], {
        icon: buildIcon(marker),
        title: marker.title,
        keyboard: true,
        zIndexOffset: marker.kind === 'job-active' ? 1000 : marker.kind === 'worker' ? 900 : 0,
      });
      m.on('click', () => markerClickRef.current?.(marker.id));
      m.addTo(layer);
    }

    if (fitToMarkers && markers.length > 0) {
      const key = markers.map((m) => m.id).sort().join('|');
      if (key !== fittedKeyRef.current) {
        fittedKeyRef.current = key;
        if (markers.length === 1) {
          map.setView([markers[0].lat, markers[0].lng], Math.max(map.getZoom(), 14));
        } else {
          map.fitBounds(L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number])), {
            padding: [40, 40],
            maxZoom: 15,
          });
        }
      }
    }
  }, [markers, circles, fitToMarkers]);

  return <div ref={containerRef} className={`plugy-map w-full rounded-2xl overflow-hidden ${className}`} />;
};
