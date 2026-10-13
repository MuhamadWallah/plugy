import React, { useState } from 'react';
import { BadgeCheck } from 'lucide-react';

const SIZES = {
  sm: 'w-8 h-8 text-xs rounded-xl',
  md: 'w-10 h-10 text-sm rounded-xl',
  lg: 'w-14 h-14 text-xl rounded-2xl',
  xl: 'w-20 h-20 text-3xl rounded-3xl',
};

const TONES = {
  emerald: 'bg-gradient-to-br from-emerald-400 to-teal-600',
  sky: 'bg-gradient-to-br from-sky-400 to-indigo-600',
};

/** Profile photo, or the person's initial when they haven't added one */
export const Avatar: React.FC<{
  name: string;
  url?: string | null;
  size?: keyof typeof SIZES;
  tone?: keyof typeof TONES;
}> = ({ name, url, size = 'md', tone = 'emerald' }) => {
  const [failed, setFailed] = useState(false);
  const classes = `${SIZES[size]} shrink-0 overflow-hidden`;

  if (url && !failed) {
    return <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} className={`${classes} object-cover bg-slate-800`} />;
  }
  return (
    <div className={`${classes} ${TONES[tone]} text-slate-950 font-black flex items-center justify-center`} aria-hidden="true">
      {name.charAt(0).toUpperCase()}
    </div>
  );
};

/** "ID verified" badge for workers whose identity document was approved */
export const IdVerifiedBadge: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <span
    className="inline-flex items-center gap-1 text-sky-300 font-bold"
    title="ID verified: identity document checked by Plugy"
    aria-label="ID verified"
  >
    <BadgeCheck className="w-3.5 h-3.5" />
    {!compact && <span className="text-[11px]">ID verified</span>}
  </span>
);
