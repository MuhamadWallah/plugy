import React, { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Smartphone } from 'lucide-react';
import { PushState, enablePushNotifications, ensurePushSubscription, pushSupported } from '../utils/push';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isInstalled = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * Lets the user turn on push alerts for this device (new offers, hired, worker on the way, messages).
 */
export const NotificationSettings: React.FC = () => {
  const [state, setState] = useState<PushState | 'checking'>('checking');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported()) {
      setState('unsupported');
      return;
    }
    ensurePushSubscription().then(setState).catch(() => setState('unavailable'));
  }, []);

  const enable = async () => {
    setBusy(true);
    setState(await enablePushNotifications().catch(() => 'unavailable' as const));
    setBusy(false);
  };

  const iosNeedsInstall = isIos() && !isInstalled();

  return (
    <section className="p-5 sm:p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-3" aria-labelledby="notif-heading">
      <h2 id="notif-heading" className="text-sm font-black text-white flex items-center gap-2">
        <Bell className="w-4 h-4 text-amber-300" /> Notifications on this device
      </h2>

      {state === 'enabled' && (
        <p className="text-sm text-emerald-300 flex items-center gap-2">
          <BellRing className="w-4 h-4" /> On. You'll be alerted about offers, hires, arrivals and messages even when Plugy is closed.
        </p>
      )}

      {state === 'default' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-slate-300">Get alerted about new offers, being hired and messages, even when Plugy is closed.</p>
          <button
            onClick={enable}
            disabled={busy}
            className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black disabled:opacity-50 shrink-0"
          >
            Turn on notifications
          </button>
        </div>
      )}

      {state === 'denied' && (
        <p className="text-sm text-slate-300 flex items-start gap-2">
          <BellOff className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          Notifications are blocked for this site. Allow them in your browser's site settings, then reload.
        </p>
      )}

      {(state === 'unsupported' || iosNeedsInstall) && state !== 'enabled' && (
        <p className="text-sm text-slate-300 flex items-start gap-2">
          <Smartphone className="w-4 h-4 text-sky-300 shrink-0 mt-0.5" />
          {iosNeedsInstall
            ? 'On iPhone, first add Plugy to your Home Screen (Share → Add to Home Screen), then open it from there and turn notifications on.'
            : !window.isSecureContext
            ? 'Notifications need a secure (HTTPS) connection.'
            : "This browser doesn't support push notifications. You'll still see alerts while Plugy is open."}
        </p>
      )}

      {state === 'unavailable' && (
        <p className="text-sm text-slate-400">Notifications aren't available right now. You'll still see alerts while Plugy is open.</p>
      )}
    </section>
  );
};
