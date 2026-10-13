import { enablePushNotifications, isPushActive } from './push';

/**
 * Asks for notification permission at a meaningful moment (posting a job, sending an offer)
 * and subscribes this device to push so alerts arrive even when Plugy is closed.
 */
export const requestNotificationPermission = () => {
  try {
    if ('Notification' in window && Notification.permission !== 'denied') {
      enablePushNotifications().catch(() => {});
    }
  } catch {
    // unsupported
  }
};

/**
 * Fallback system notification while the Plugy tab is in the background on browsers without
 * push. With push active, the service worker shows these instead (avoiding duplicates).
 */
export const showSystemNotification = (title: string, body: string, onClick?: () => void) => {
  try {
    if (isPushActive()) return;
    if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
    const n = new Notification(title, { body, tag: `${title}:${body}`, icon: '/icons/icon-192.png' });
    n.onclick = () => {
      window.focus();
      onClick?.();
      n.close();
    };
  } catch {
    // unsupported (e.g. some mobile browsers require a service worker)
  }
};
