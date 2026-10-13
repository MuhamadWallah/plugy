import { getAppConfig } from './config';

export type PushState = 'enabled' | 'default' | 'denied' | 'unsupported' | 'unavailable';

let pushActive = false;

/** True once this device is subscribed: the service worker then handles background alerts */
export const isPushActive = () => pushActive;

export const pushSupported = (): boolean =>
  typeof window !== 'undefined' &&
  window.isSecureContext &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

const base64UrlToBytes = (value: string): Uint8Array => {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const sameKey = (current: ArrayBuffer | null, expected: Uint8Array): boolean => {
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === expected.length && bytes.every((b, i) => b === expected[i]);
};

const serviceWorkerReady = (): Promise<ServiceWorkerRegistration | null> =>
  Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
  ]);

let inFlight: Promise<PushState> | null = null;

/**
 * Subscribes this device for push (only if permission was already granted; never prompts)
 * and registers it with the server for the signed-in user. Concurrent callers share one
 * attempt: parallel subscribe() calls would each mint a different endpoint.
 */
export const ensurePushSubscription = (): Promise<PushState> => {
  if (!inFlight) {
    inFlight = subscribeDevice().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
};

const subscribeDevice = async (): Promise<PushState> => {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'default';

  const { pushPublicKey } = await getAppConfig();
  if (!pushPublicKey) return 'unavailable';

  const registration = await serviceWorkerReady();
  if (!registration) return 'unavailable';

  try {
    const serverKey = base64UrlToBytes(pushPublicKey);
    let subscription = await registration.pushManager.getSubscription();
    // The server's keys changed (e.g. new deployment): subscribe again with the new key
    if (subscription && !sameKey(subscription.options.applicationServerKey, serverKey)) {
      const staleEndpoint = subscription.endpoint;
      await subscription.unsubscribe();
      subscription = null;
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ endpoint: staleEndpoint }),
      }).catch(() => {});
    }
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: serverKey as BufferSource,
      });
    }

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(subscription.toJSON()),
    });
    pushActive = res.ok;
    return res.ok ? 'enabled' : 'unavailable';
  } catch (err) {
    console.warn('Push subscription failed:', err);
    pushActive = false;
    return 'unavailable';
  }
};

/** Asks for permission (call from a user action) and subscribes */
export const enablePushNotifications = async (): Promise<PushState> => {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'default') {
    const result = await Notification.requestPermission();
    if (result !== 'granted') return result === 'denied' ? 'denied' : 'default';
  }
  return ensurePushSubscription();
};

/** Stops sending this user's alerts to this device (on sign-out). */
export const unregisterPushForThisDevice = async () => {
  pushActive = false;
  try {
    if (!pushSupported()) return;
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
    }
  } catch {
    // best effort
  }
};
