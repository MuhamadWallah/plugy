import React, { useEffect, useState } from 'react';
import { X, Star, ShieldCheck, Briefcase, CalendarDays, RefreshCw } from 'lucide-react';
import { memberSince, relativeTime } from '../utils/format';
import { Portal } from './Portal';
import { categoryName } from '../utils/categories';

interface PublicProfile {
  id: string;
  name: string;
  avatar_url: string | null;
  rating_avg: string | number;
  rating_count: number;
  phone_verified: boolean;
  member_since: string;
  jobs_completed: number;
  jobs_posted: number;
  work_categories?: string[];
}

interface Review {
  id: string;
  score: number;
  comment: string | null;
  created_at: string;
  from_customer: boolean;
  job_title: string;
  rater: { id: string; name: string };
}

export const ProfileSummary: React.FC<{ userId: string; compact?: boolean }> = ({ userId, compact = false }) => {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/users/${userId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load this profile');
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setProfile(data.profile);
        setReviews(data.reviews || []);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="py-10 flex justify-center">
        <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin" />
      </div>
    );
  }
  if (error || !profile) {
    return <p className="py-8 text-center text-sm text-rose-300">{error || 'Profile not found'}</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-slate-950 font-black text-xl flex items-center justify-center">
          {profile.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h3 className="text-lg font-black text-white">{profile.name}</h3>
          <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
            <span className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <strong className="text-white">{Number(profile.rating_avg).toFixed(1)}</strong>
              ({profile.rating_count} {profile.rating_count === 1 ? 'review' : 'reviews'})
            </span>
            {profile.phone_verified && (
              <span className="flex items-center gap-1 text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" /> Phone verified
              </span>
            )}
          </div>
        </div>
      </div>

      {profile.work_categories && profile.work_categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Works in">
          {profile.work_categories.map((slug) => (
            <span key={slug} className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
              {categoryName(slug)}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
          <Briefcase className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
          <div className="text-lg font-black text-white">{profile.jobs_completed}</div>
          <div className="text-[10px] text-slate-400 uppercase font-bold">Jobs done</div>
        </div>
        <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
          <Star className="w-4 h-4 text-amber-400 mx-auto mb-1" />
          <div className="text-lg font-black text-white">{profile.jobs_posted}</div>
          <div className="text-[10px] text-slate-400 uppercase font-bold">Jobs posted</div>
        </div>
        <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
          <CalendarDays className="w-4 h-4 text-sky-400 mx-auto mb-1" />
          <div className="text-sm font-black text-white pt-1">{memberSince(profile.member_since)}</div>
          <div className="text-[10px] text-slate-400 uppercase font-bold">Member since</div>
        </div>
      </div>

      <div>
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">Reviews</h4>
        {reviews.length === 0 ? (
          <p className="text-sm text-slate-500">No reviews yet.</p>
        ) : (
          <ul className={`space-y-2 ${compact ? 'max-h-64' : 'max-h-96'} overflow-y-auto pr-1`}>
            {reviews.map((review) => (
              <li key={review.id} className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className={`w-3 h-3 ${s <= review.score ? 'text-amber-400 fill-amber-400' : 'text-slate-700'}`} />
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-500">{relativeTime(review.created_at)}</span>
                </div>
                {review.comment && <p className="text-sm text-slate-200 mt-1.5">&ldquo;{review.comment}&rdquo;</p>}
                <p className="text-[11px] text-slate-500 mt-1">
                  {review.rater.name} · as {review.from_customer ? 'customer' : 'worker'} · {review.job_title}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export const ProfileModal: React.FC<{ userId: string; onClose: () => void }> = ({ userId, onClose }) => (
  <Portal>
  <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-950/85 backdrop-blur-md" onClick={onClose}>
    <div
      role="dialog"
      aria-modal="true"
      aria-label="User profile"
      className="w-full sm:max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex justify-end -mt-1 -mr-1">
        <button onClick={onClose} className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>
      <ProfileSummary userId={userId} />
    </div>
  </div>
  </Portal>
);
