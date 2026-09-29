import React, { useState } from 'react';
import { Star, MessageSquare, CheckCircle2, AlertCircle, RefreshCw, Send } from 'lucide-react';

interface RatingPromptProps {
  jobId: string;
  rateeName: string;
  rateeRole: 'poster' | 'worker';
  onRatingSuccess: (rating: { score: number; comment: string | null }) => void;
}

const SCORE_LABELS: Record<number, string> = {
  1: '1 Star — Needs Improvement',
  2: '2 Stars — Fair Experience',
  3: '3 Stars — Good Job',
  4: '4 Stars — Very Good Service',
  5: '5 Stars — Exceptional & Highly Recommended!',
};

export const RatingPrompt: React.FC<RatingPromptProps> = ({
  jobId,
  rateeName,
  rateeRole,
  onRatingSuccess,
}) => {
  const [score, setScore] = useState<number>(5);
  const [hoverScore, setHoverScore] = useState<number | null>(null);
  const [comment, setComment] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  const displayScore = hoverScore ?? score;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/jobs/${jobId}/rate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          score,
          comment: comment.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit rating');
      }

      setSuccess(true);
      onRatingSuccess({
        score,
        comment: comment.trim() || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error submitting rating');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2 animate-in fade-in duration-200">
        <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6 stroke-[2.2]" />
        </div>
        <h4 className="text-sm font-bold text-white">Rating Submitted!</h4>
        <p className="text-xs text-slate-300">
          Thank you for providing feedback for {rateeName}.
        </p>
        <div className="flex items-center justify-center gap-1 text-amber-400 pt-1">
          {[1, 2, 3, 4, 5].map((s) => (
            <Star
              key={s}
              className={`w-4 h-4 ${
                s <= score ? 'fill-amber-400 text-amber-400' : 'text-slate-700'
              }`}
            />
          ))}
          <span className="text-xs font-bold text-white ml-1.5">{score}.0</span>
        </div>
        {comment && (
          <p className="text-xs italic text-slate-400 pt-1 border-t border-emerald-500/20 max-w-sm mx-auto">
            &ldquo;{comment}&rdquo;
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-950/20 via-slate-900 to-slate-950 border border-amber-500/30 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 mb-1">
            <Star className="w-3 h-3 fill-amber-400" />
            Rate Experience
          </span>
          <h3 className="text-sm sm:text-base font-bold text-white">
            How was your experience with {rateeName}?
          </h3>
          <p className="text-xs text-slate-400">
            Please rate the {rateeRole === 'worker' ? 'assigned worker' : 'job poster'} now that the job is completed.
          </p>
        </div>
      </div>

      {/* Interactive Star Picker */}
      <div className="space-y-1.5 py-1">
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((starValue) => {
            const isFilled = starValue <= displayScore;
            return (
              <button
                key={starValue}
                type="button"
                onClick={() => setScore(starValue)}
                onMouseEnter={() => setHoverScore(starValue)}
                onMouseLeave={() => setHoverScore(null)}
                className="p-1 -m-1 text-slate-700 hover:scale-110 transition-transform cursor-pointer focus:outline-none"
                title={`${starValue} Star${starValue > 1 ? 's' : ''}`}
              >
                <Star
                  className={`w-7 h-7 sm:w-8 sm:h-8 transition-colors ${
                    isFilled
                      ? 'fill-amber-400 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]'
                      : 'text-slate-700 hover:text-slate-500'
                  }`}
                />
              </button>
            );
          })}
        </div>
        <div className="text-xs font-semibold text-amber-300">
          {SCORE_LABELS[displayScore]}
        </div>
      </div>

      {/* Optional Comment */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <MessageSquare className="w-3 h-3 text-slate-500" />
            Review Comment (Optional)
          </span>
          <span className="text-[10px] text-slate-500">{comment.length}/1000</span>
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={1000}
          rows={2}
          placeholder={`Describe what you appreciated or how ${rateeName} did on the job...`}
          className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 transition resize-none"
        />
      </div>

      {error && (
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Submit Action */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? (
          <RefreshCw className="w-4 h-4 animate-spin" />
        ) : (
          <>
            <Send className="w-3.5 h-3.5" />
            <span>Submit Rating</span>
          </>
        )}
      </button>
    </div>
  );
};
