import React, { useState } from 'react';
import { 
  Navigation, 
  MapPin, 
  Radio, 
  Sparkles, 
  DollarSign, 
  Users,
  Compass
} from 'lucide-react';
import { FeedJob } from './JobFeed';
import { sound } from '../utils/sound';

interface InteractiveMapRadarProps {
  jobs: FeedJob[];
  selectedJobId?: string | null;
  onSelectJob: (jobId: string) => void;
  selectedCategory: string;
}

export const InteractiveMapRadar: React.FC<InteractiveMapRadarProps> = ({
  jobs,
  selectedJobId,
  onSelectJob,
  selectedCategory: _selectedCategory,
}) => {
  const [radarActive, setRadarActive] = useState(true);
  const [hoveredJob, setHoveredJob] = useState<FeedJob | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(10);
  const [hoveredPinPos, setHoveredPinPos] = useState<{ x: number; y: number } | null>(null);

  // Generate deterministic coordinate offsets inside radar circle based on job ID string
  const getJobCoordinates = (jobId: string, index: number, total: number) => {
    let hash = 0;
    for (let i = 0; i < jobId.length; i++) {
      hash = (hash << 5) - hash + jobId.charCodeAt(i);
      hash |= 0;
    }
    const angle = (index / Math.max(total, 1)) * 2 * Math.PI + ((Math.abs(hash) % 100) / 100) * 0.5;
    const distanceFactor = 0.25 + ((Math.abs(hash >> 3) % 65) / 100) * 0.55; // between 25% and 80% of radius

    const x = 50 + Math.cos(angle) * distanceFactor * 42;
    const y = 50 + Math.sin(angle) * distanceFactor * 42;

    return { x: Math.max(12, Math.min(88, x)), y: Math.max(12, Math.min(88, y)) };
  };

  // Mock nearby couriers / workers dots on radar
  const mockWorkers = [
    { x: 38, y: 32, name: 'David (Plumber)' },
    { x: 64, y: 28, name: 'Elena (Cleaner)' },
    { x: 42, y: 68, name: 'Tinashe (Gardener)' },
    { x: 72, y: 65, name: 'Marco (Detailer)' },
    { x: 26, y: 55, name: 'Amina (Babysitter)' },
  ];

  return (
    <div className="relative w-full rounded-3xl overflow-hidden bg-slate-950 border border-slate-800/80 shadow-2xl flex flex-col">
      {/* Top Map Header Controls */}
      <div className="px-5 py-3.5 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between z-10 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <Navigation className="w-4 h-4 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-white tracking-tight">Neighborhood Job Radar</span>
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                InDrive Mode
              </span>
            </div>
            <div className="text-[10px] text-slate-400 flex items-center gap-2">
              <span>{jobs.length} jobs in view</span>
              <span>&bull;</span>
              <span className="flex items-center gap-1 text-slate-300">
                <Users className="w-2.5 h-2.5 text-emerald-400" />
                {mockWorkers.length} workers nearby
              </span>
            </div>
          </div>
        </div>

        {/* Radar Controls */}
        <div className="flex items-center gap-2">
          {/* Radius selector */}
          <div className="hidden sm:flex items-center bg-slate-950 p-0.5 rounded-xl border border-slate-800 text-[10px] font-semibold">
            {[5, 10, 25].map((km) => (
              <button
                key={km}
                onClick={() => {
                  sound.playTap();
                  setRadiusKm(km);
                }}
                className={`px-2 py-1 rounded-lg transition cursor-pointer ${
                  radiusKm === km
                    ? 'bg-slate-800 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {km}km
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              sound.playTap();
              setRadarActive(!radarActive);
            }}
            className={`p-1.5 rounded-xl border text-xs transition cursor-pointer flex items-center gap-1.5 px-2.5 ${
              radarActive
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
            title="Toggle Radar Sweep Animation"
          >
            <Radio className={`w-3.5 h-3.5 ${radarActive ? 'animate-pulse text-emerald-400' : ''}`} />
            <span className="hidden md:inline font-semibold">{radarActive ? 'Active' : 'Paused'}</span>
          </button>
        </div>
      </div>

      {/* SVG Canvas Map Display */}
      <div className="relative w-full aspect-video min-h-[300px] max-h-[460px] bg-slate-950 overflow-hidden select-none">
        <svg
          className="w-full h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Radar gradient sweep */}
            <radialGradient id="radarCenterGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.18" />
              <stop offset="50%" stopColor="#0d9488" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#020617" stopOpacity="0" />
            </radialGradient>

            <linearGradient id="sweepGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>

            <pattern id="mapGrid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(30, 41, 59, 0.45)" strokeWidth="0.3" />
            </pattern>
          </defs>

          {/* Grid Background */}
          <rect width="100" height="100" fill="#020617" />
          <rect width="100" height="100" fill="url(#mapGrid)" />

          {/* Stylized Simulated Map Roads & Rivers */}
          <path
            d="M -10 30 Q 30 45 60 20 T 110 40"
            fill="none"
            stroke="rgba(14, 165, 233, 0.2)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <path
            d="M 20 -10 Q 35 40 50 50 T 80 110"
            fill="none"
            stroke="rgba(51, 65, 85, 0.6)"
            strokeWidth="1.2"
          />
          <path
            d="M -10 65 Q 40 50 110 75"
            fill="none"
            stroke="rgba(51, 65, 85, 0.6)"
            strokeWidth="1.2"
          />
          <path
            d="M 50 0 L 50 100 M 0 50 L 100 50"
            fill="none"
            stroke="rgba(51, 65, 85, 0.25)"
            strokeWidth="0.4"
            strokeDasharray="1,1"
          />

          {/* Concentric Range Rings */}
          <circle cx="50" cy="50" r="18" fill="none" stroke="rgba(16, 185, 129, 0.25)" strokeWidth="0.4" />
          <circle cx="50" cy="50" r="32" fill="none" stroke="rgba(16, 185, 129, 0.2)" strokeWidth="0.4" strokeDasharray="1.5,1.5" />
          <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(16, 185, 129, 0.15)" strokeWidth="0.4" />

          {/* Radar Center Ambient Glow */}
          <circle cx="50" cy="50" r="45" fill="url(#radarCenterGlow)" />

          {/* Dynamic Radar Sweep Cone */}
          {radarActive && (
            <g className="animate-radar-sweep origin-center" style={{ transformOrigin: '50px 50px' }}>
              <path
                d="M 50 50 L 50 5 A 45 45 0 0 1 90 30 Z"
                fill="url(#sweepGradient)"
                opacity="0.4"
              />
              <line x1="50" y1="50" x2="50" y2="5" stroke="#34d399" strokeWidth="0.8" opacity="0.8" />
            </g>
          )}

          {/* Center User GPS Marker */}
          <circle cx="50" cy="50" r="2.5" fill="#10b981" />
          <circle cx="50" cy="50" r="6" fill="none" stroke="#10b981" strokeWidth="0.6" opacity="0.6" />
          <circle cx="50" cy="50" r="1.2" fill="#ffffff" />

          {/* Mock Worker Pins nearby */}
          {mockWorkers.map((w, idx) => (
            <g key={idx} className="cursor-pointer" opacity="0.75">
              <circle cx={w.x} cy={w.y} r="1" fill="#38bdf8" />
              <circle cx={w.x} cy={w.y} r="2.2" fill="none" stroke="#38bdf8" strokeWidth="0.4" opacity="0.4" />
            </g>
          ))}
        </svg>

        {/* Center Label */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-3 pointer-events-none">
          <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400 bg-slate-950/80 px-2 py-0.5 rounded-full border border-emerald-500/30 backdrop-blur-sm">
            Your Location
          </span>
        </div>

        {/* Interactive HTML Job Pins Placed Over SVG */}
        {jobs.map((job, idx) => {
          const pos = getJobCoordinates(job.id, idx, jobs.length);
          const isSelected = selectedJobId === job.id;
          const isHovered = hoveredJob?.id === job.id;

          return (
            <div
              key={job.id}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-20 group cursor-pointer"
              onMouseEnter={() => {
                setHoveredJob(job);
                setHoveredPinPos(pos);
              }}
              onMouseLeave={() => setHoveredJob(null)}
              onClick={() => {
                sound.playTap();
                onSelectJob(job.id);
              }}
            >
              {/* Pulsing Beacon Ring */}
              <div
                className={`absolute inset-0 rounded-full -m-2 pointer-events-none ${
                  isSelected
                    ? 'bg-amber-400/40 animate-ping'
                    : 'bg-emerald-400/30 group-hover:bg-emerald-400/50 animate-pulse'
                }`}
              ></div>

              {/* Pin Button */}
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold shadow-lg transition-all duration-200 ${
                  isSelected
                    ? 'bg-amber-400 text-slate-950 scale-125 ring-4 ring-amber-400/30'
                    : isHovered
                    ? 'bg-emerald-400 text-slate-950 scale-120 ring-2 ring-white/60'
                    : 'bg-slate-900 border border-emerald-500/60 text-emerald-400 hover:scale-115'
                }`}
              >
                <MapPin className="w-3.5 h-3.5 fill-current" />
              </div>

              {/* Quick Budget Badge on top of pin */}
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-950/90 text-white font-extrabold text-[9px] px-1.5 py-0.2 rounded-md border border-slate-800 shadow-md">
                {job.budget !== null ? `$${Math.round(job.budget)}` : 'Neg'}
              </div>
            </div>
          );
        })}

        {/* Hovered Job Interactive Floating Tooltip Card */}
        {hoveredJob && hoveredPinPos && (
          <div
            style={{
              left: `${Math.min(78, Math.max(22, hoveredPinPos.x))}%`,
              top: hoveredPinPos.y > 60 ? `${hoveredPinPos.y - 18}%` : `${hoveredPinPos.y + 12}%`,
            }}
            className="absolute -translate-x-1/2 z-30 pointer-events-auto bg-slate-900/95 border border-emerald-500/40 rounded-2xl p-3.5 shadow-2xl backdrop-blur-xl w-64 animate-in fade-in zoom-in-95 duration-100 cursor-pointer"
            onClick={() => {
              sound.playTap();
              onSelectJob(hoveredJob.id);
            }}
          >
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 capitalize">
                <Sparkles className="w-2.5 h-2.5" />
                {hoveredJob.category_name}
              </span>
              <div className="flex items-center gap-0.5 text-xs font-black text-white bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
                <DollarSign className="w-3 h-3 text-emerald-400" />
                <span>{hoveredJob.budget !== null ? `$${Number(hoveredJob.budget).toFixed(2)}` : 'Negotiable'}</span>
              </div>
            </div>

            <div className="font-bold text-xs text-white line-clamp-1 mb-1">{hoveredJob.title}</div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1 mb-2">
              <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
              <span className="truncate">{hoveredJob.location_text}</span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[10px]">
              <span className="text-slate-400">By {hoveredJob.poster.name}</span>
              <span className="font-bold text-emerald-400 flex items-center gap-1 hover:underline">
                View & Accept &rarr;
              </span>
            </div>
          </div>
        )}

        {/* Radar Corner Compass / Legend */}
        <div className="absolute bottom-3 right-3 flex items-center gap-2 bg-slate-950/80 border border-slate-800/80 px-2.5 py-1.5 rounded-xl backdrop-blur-md text-[10px] text-slate-400">
          <Compass className="w-3.5 h-3.5 text-emerald-400 animate-spin" style={{ animationDuration: '24s' }} />
          <span>Local Area ({radiusKm}km radius)</span>
        </div>

        <div className="absolute bottom-3 left-3 flex items-center gap-3 bg-slate-950/80 border border-slate-800/80 px-2.5 py-1.5 rounded-xl backdrop-blur-md text-[10px]">
          <div className="flex items-center gap-1 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Open Job</span>
          </div>
          <div className="flex items-center gap-1 text-slate-400">
            <span className="w-2 h-2 rounded-full bg-sky-400"></span>
            <span>Worker</span>
          </div>
        </div>
      </div>
    </div>
  );
};
