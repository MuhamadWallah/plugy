import React, { useState } from 'react';
import { X, Banknote, Clock, MessageSquare, Send, Undo2, AlertCircle, Star, MapPin, CalendarClock, Wallet } from 'lucide-react';
import { Job, MyOfferSummary } from '../types/marketplace';
import { ETA_OPTIONS, formatDistance, formatMoney, formatSchedule, paymentLabel, readApiError } from '../utils/format';
import { requestNotificationPermission } from '../utils/notify';
import { sound } from '../utils/sound';
import { Portal } from './Portal';

interface OfferModalProps {
  job: Pick<Job, 'id' | 'title' | 'budget' | 'category_name' | 'location_text' | 'poster' | 'distance_km' | 'scheduled_for' | 'payment_method'>;
  existingOffer?: MyOfferSummary | null;
  onClose: () => void;
  /** Called with the saved offer (or null when withdrawn) */
  onSaved: (offer: MyOfferSummary | null, message: string) => void;
}

/**
 * Worker's response to a job: accept the customer's price or propose a different one,
 * with an arrival estimate and a short note.
 */
export const OfferModal: React.FC<OfferModalProps> = ({ job, existingOffer, onClose, onSaved }) => {
  const budget = job.budget !== null && job.budget !== undefined ? Number(job.budget) : null;
  const [price, setPrice] = useState<string>(
    existingOffer ? String(Number(existingOffer.price)) : budget !== null ? String(budget) : ''
  );
  const [eta, setEta] = useState<number | null>(existingOffer?.eta_minutes ?? null);
  const [message, setMessage] = useState<string>(existingOffer?.message ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPending = existingOffer?.status === 'pending';
  const isDeclined = existingOffer?.status === 'declined';
  const priceNumber = Number(price);
  const isCounter = budget !== null && Number.isFinite(priceNumber) && priceNumber !== budget;

  const submit = async (overridePrice?: number) => {
    const finalPrice = overridePrice ?? priceNumber;
    if (!Number.isFinite(finalPrice) || finalPrice <= 0) {
      setError('Enter the price you want for this job.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ price: finalPrice, eta_minutes: job.scheduled_for ? null : eta, message: message.trim() || null }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, 'Could not send your offer'));
      }
      const data = await res.json();
      sound.playChime();
      requestNotificationPermission();
      onSaved(
        {
          id: data.offer.id,
          price: data.offer.price,
          status: data.offer.status,
          eta_minutes: data.offer.eta_minutes,
          message: data.offer.message,
        },
        res.status === 201
          ? `Offer of ${formatMoney(finalPrice)} sent. You'll be notified when the customer chooses.`
          : `Offer updated to ${formatMoney(finalPrice)}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your offer');
    } finally {
      setSubmitting(false);
    }
  };

  const withdraw = async () => {
    setWithdrawing(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}/offers/withdraw`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error(await readApiError(res, 'Could not withdraw your offer'));
      sound.playTap();
      onSaved(null, 'Offer withdrawn.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not withdraw your offer');
    } finally {
      setWithdrawing(false);
    }
  };

  const counterChips = budget !== null ? [budget + 5, budget + 10, budget + 20] : [20, 40, 60];

  return (
    <Portal>
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/85 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="offer-modal-title"
        className="w-full sm:max-w-lg bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">{job.category_name}</p>
            <h2 id="offer-modal-title" className="text-base font-black text-white truncate">{job.title}</h2>
            <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{job.location_text}</span>
              {formatDistance(job.distance_km) && <span>· {formatDistance(job.distance_km)} away</span>}
              <span className="flex items-center gap-1">
                · {job.poster.name}
                <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                {Number(job.poster.rating_avg).toFixed(1)}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-2 text-slate-200">
              <CalendarClock className="w-4 h-4 text-sky-400 shrink-0" />
              <span><span className="block text-[10px] uppercase font-bold text-slate-500">When</span>{formatSchedule(job.scheduled_for)}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-2 text-slate-200">
              <Wallet className="w-4 h-4 text-emerald-400 shrink-0" />
              <span><span className="block text-[10px] uppercase font-bold text-slate-500">Payment</span>{paymentLabel(job.payment_method)}</span>
            </div>
          </div>

          {isDeclined && (
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              The customer declined your offer for this job.
            </div>
          )}

          {/* One-tap accept of the customer's price */}
          {budget !== null && !isDeclined && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase font-bold tracking-wider text-emerald-300">Customer's price</p>
                <p className="text-2xl font-black text-white">{formatMoney(budget)}</p>
              </div>
              <button
                onClick={() => submit(budget)}
                disabled={submitting}
                className="px-4 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm disabled:opacity-50"
              >
                Accept for {formatMoney(budget)}
              </button>
            </div>
          )}

          {!isDeclined && (
            <>
              <div>
                <label htmlFor="offer-price" className="block text-xs font-black text-slate-300 uppercase tracking-wider mb-2">
                  {budget !== null ? 'Or offer your price' : 'Your price'}
                </label>
                <div className="relative">
                  <Banknote className="w-4 h-4 text-emerald-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="offer-price"
                    type="number"
                    inputMode="decimal"
                    min="1"
                    step="0.5"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="e.g. 45"
                    className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 focus:border-emerald-500 text-base font-bold text-white outline-none"
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  {counterChips.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setPrice(String(amount))}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-bold border ${
                        priceNumber === amount
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:text-white'
                      }`}
                    >
                      {formatMoney(amount)}
                    </button>
                  ))}
                </div>
              </div>

              {!job.scheduled_for && (
              <div>
                <p className="text-xs font-black text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-sky-400" /> When can you arrive?
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {ETA_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setEta(eta === opt.value ? null : opt.value)}
                      className={`py-2 rounded-xl text-xs font-bold border ${
                        eta === opt.value
                          ? 'bg-sky-500 text-slate-950 border-sky-400'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              )}

              <div>
                <label htmlFor="offer-message" className="text-xs font-black text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-slate-400" /> Note to the customer (optional)
                </label>
                <textarea
                  id="offer-message"
                  rows={2}
                  maxLength={500}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Experience, tools you'll bring, questions..."
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:border-emerald-500 text-sm text-white placeholder-slate-500 outline-none resize-none"
                />
              </div>
            </>
          )}

          {error && (
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2">
            {isPending && (
              <button
                onClick={withdraw}
                disabled={withdrawing}
                className="sm:w-auto px-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-rose-300 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Undo2 className="w-4 h-4" />
                Withdraw offer
              </button>
            )}
            {!isDeclined && (
              <button
                onClick={() => submit()}
                disabled={submitting || !price}
                className="flex-1 px-4 py-3 rounded-2xl bg-white hover:bg-slate-100 text-slate-950 text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {isPending ? 'Update offer' : isCounter ? `Offer ${formatMoney(priceNumber)}` : 'Send offer'}
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-500 text-center">
            The customer compares offers and chooses who to hire. Payment is agreed directly between you.
          </p>
        </div>
      </div>
    </div>
    </Portal>
  );
};
