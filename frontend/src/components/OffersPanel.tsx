import React, { useCallback, useEffect, useState } from 'react';
import { Star, ShieldCheck, Clock, TrendingUp, Check, X, RefreshCw, Users, AlertCircle, Briefcase } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { Job, Offer } from '../types/marketplace';
import { formatEta, formatMoney, readApiError, relativeTime } from '../utils/format';
import { ProfileModal } from './ProfileModal';
import { sound } from '../utils/sound';

interface OffersPanelProps {
  job: Pick<Job, 'id' | 'budget' | 'status'>;
  onHired: (job: Job) => void;
  onBudgetChanged: (job: Job) => void;
}

/**
 * Poster's view of an open job: incoming offers (live), hire/decline, and "raise your price".
 */
export const OffersPanel: React.FC<OffersPanelProps> = ({ job, onHired, onBudgetChanged }) => {
  const { socket } = useSocket();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [raising, setRaising] = useState(false);
  const [raiseValue, setRaiseValue] = useState('');

  const budget = job.budget !== null && job.budget !== undefined ? Number(job.budget) : null;

  const fetchOffers = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${job.id}/offers`, { credentials: 'include' });
      if (!res.ok) throw new Error(await readApiError(res, 'Could not load offers'));
      const data = await res.json();
      setOffers(data.offers || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load offers');
    } finally {
      setLoading(false);
    }
  }, [job.id]);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  // Live: new/updated offers and withdrawals; refetch after reconnecting
  useEffect(() => {
    if (!socket) return;
    const onNew = (data: { jobId: string; offer: Offer }) => {
      if (data.jobId !== job.id) return;
      setOffers((prev) => [data.offer, ...prev.filter((o) => o.id !== data.offer.id)]);
    };
    const onWithdrawn = (data: { jobId: string; offerId: string }) => {
      if (data.jobId !== job.id) return;
      setOffers((prev) => prev.filter((o) => o.id !== data.offerId));
    };
    socket.on('offer:new', onNew);
    socket.on('offer:withdrawn', onWithdrawn);
    socket.on('connect', fetchOffers);
    return () => {
      socket.off('offer:new', onNew);
      socket.off('offer:withdrawn', onWithdrawn);
      socket.off('connect', fetchOffers);
    };
  }, [socket, job.id, fetchOffers]);

  const hire = async (offer: Offer) => {
    setBusyId(offer.id);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}/offers/${offer.id}/accept`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error(await readApiError(res, 'Could not hire this worker'));
      const data = await res.json();
      sound.playSuccess();
      onHired(data.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not hire this worker');
      fetchOffers();
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  };

  const decline = async (offer: Offer) => {
    setBusyId(offer.id);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}/offers/${offer.id}/decline`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error(await readApiError(res, 'Could not decline this offer'));
      sound.playTap();
      setOffers((prev) => prev.map((o) => (o.id === offer.id ? { ...o, status: 'declined' } : o)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not decline this offer');
    } finally {
      setBusyId(null);
    }
  };

  const raisePrice = async (amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid price.');
      return;
    }
    setRaising(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}/budget`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ budget: amount }),
      });
      if (!res.ok) throw new Error(await readApiError(res, 'Could not change the price'));
      const data = await res.json();
      sound.playChime();
      setRaiseValue('');
      onBudgetChanged(data.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the price');
    } finally {
      setRaising(false);
    }
  };

  const pending = offers.filter((o) => o.status === 'pending');
  const declined = offers.filter((o) => o.status === 'declined');
  const raiseChips = budget !== null ? [budget + 5, budget + 10, budget + 20] : [];

  return (
    <section className="space-y-3" aria-labelledby="offers-heading">
      <div className="flex items-center justify-between">
        <h3 id="offers-heading" className="text-sm font-black text-white flex items-center gap-2">
          <Users className="w-4 h-4 text-emerald-400" />
          Offers from workers
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-xs">{pending.length}</span>
        </h3>
        <button onClick={fetchOffers} className="p-1.5 rounded-lg text-slate-400 hover:text-white" aria-label="Refresh offers">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {!loading && pending.length === 0 && (
        <div className="p-4 rounded-2xl bg-slate-950/60 border border-dashed border-slate-700 text-center">
          <p className="text-sm text-slate-300 font-semibold">Waiting for offers…</p>
          <p className="text-xs text-slate-500 mt-1">
            Nearby workers can accept your price or suggest their own. New offers appear here instantly.
          </p>
        </div>
      )}

      <ul className="space-y-2.5">
        {pending.map((offer) => {
          const price = Number(offer.price);
          const isCounter = budget !== null && price !== budget;
          return (
            <li key={offer.id} className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => setProfileId(offer.worker.id)} className="flex items-center gap-3 text-left min-w-0">
                  <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-600 text-slate-950 font-black flex items-center justify-center">
                    {offer.worker.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                      {offer.worker.name}
                      {offer.worker.phone_verified && <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" aria-label="Phone verified" />}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap">
                      <span className="flex items-center gap-0.5">
                        <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                        <strong className="text-slate-200">{Number(offer.worker.rating_avg).toFixed(1)}</strong>
                        ({offer.worker.rating_count})
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Briefcase className="w-3 h-3" /> {offer.worker.jobs_completed} jobs
                      </span>
                      <span className="underline decoration-dotted">View profile</span>
                    </div>
                  </div>
                </button>
                <div className="text-right shrink-0">
                  <div className="text-lg font-black text-white">{formatMoney(price)}</div>
                  <div className={`text-[10px] font-bold uppercase ${isCounter ? 'text-amber-300' : 'text-emerald-400'}`}>
                    {budget === null ? 'Their price' : isCounter ? (price > budget ? 'Counter-offer' : 'Lower price') : 'Your price'}
                  </div>
                </div>
              </div>

              {(offer.eta_minutes !== null || offer.message) && (
                <div className="text-xs text-slate-300 space-y-1">
                  {offer.eta_minutes !== null && (
                    <p className="flex items-center gap-1.5 text-sky-300">
                      <Clock className="w-3.5 h-3.5" /> Can arrive: {formatEta(offer.eta_minutes)}
                    </p>
                  )}
                  {offer.message && <p className="italic text-slate-300">&ldquo;{offer.message}&rdquo;</p>}
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-slate-500">{relativeTime(offer.updated_at)}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => decline(offer)}
                    disabled={busyId === offer.id}
                    className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-rose-300 text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" /> Decline
                  </button>
                  {confirmId === offer.id ? (
                    <button
                      onClick={() => hire(offer)}
                      disabled={busyId === offer.id}
                      className="px-3 py-2 rounded-xl bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1 disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" /> Confirm {formatMoney(price)}
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmId(offer.id)}
                      className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" /> Hire
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {declined.length > 0 && (
        <p className="text-[11px] text-slate-500">{declined.length} declined {declined.length === 1 ? 'offer' : 'offers'} hidden.</p>
      )}

      {/* Raise the price to attract workers */}
      {job.status === 'open' && (
        <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2.5">
          <p className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
            {budget !== null ? `Not getting offers? Raise your price (now ${formatMoney(budget)})` : 'Set a price to attract more workers'}
          </p>
          <div className="flex gap-2 flex-wrap">
            {raiseChips.map((amount) => (
              <button
                key={amount}
                onClick={() => raisePrice(amount)}
                disabled={raising}
                className="px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs font-bold disabled:opacity-50"
              >
                {formatMoney(amount)}
              </button>
            ))}
            <div className="flex gap-1.5 flex-1 min-w-[150px]">
              <input
                type="number"
                inputMode="decimal"
                min="1"
                value={raiseValue}
                onChange={(e) => setRaiseValue(e.target.value)}
                placeholder="Other amount"
                aria-label="New price"
                className="flex-1 min-w-0 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white outline-none focus:border-amber-500"
              />
              <button
                onClick={() => raisePrice(Number(raiseValue))}
                disabled={raising || !raiseValue}
                className="px-3 py-1.5 rounded-xl bg-amber-400 text-slate-950 text-xs font-black disabled:opacity-50"
              >
                Set
              </button>
            </div>
          </div>
        </div>
      )}

      {profileId && <ProfileModal userId={profileId} onClose={() => setProfileId(null)} />}
    </section>
  );
};
