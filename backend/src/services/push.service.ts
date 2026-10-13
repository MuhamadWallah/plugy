import fs from 'fs';
import path from 'path';
import webpush from 'web-push';
import { env } from '../config/env.js';
import { query } from '../config/db.js';

export interface PushPayload {
  title: string;
  body: string;
  /** Path opened when the notification is tapped */
  url: string;
  /** Notifications with the same tag replace each other */
  tag: string;
}

let vapidKeys: { publicKey: string; privateKey: string } | null = null;

const DEV_KEY_FILE = path.resolve('.vapid-dev.json');

/**
 * Configures Web Push. Production uses VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY; without them push is off.
 * Development generates a key pair once and keeps it in .vapid-dev.json (git-ignored) so browser
 * subscriptions survive restarts.
 */
export const initPush = () => {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    vapidKeys = { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  } else if (!env.isProduction) {
    try {
      vapidKeys = JSON.parse(fs.readFileSync(DEV_KEY_FILE, 'utf8'));
    } catch {
      vapidKeys = webpush.generateVAPIDKeys();
      try {
        fs.writeFileSync(DEV_KEY_FILE, JSON.stringify(vapidKeys));
      } catch {
        // read-only filesystem: keys last until restart
      }
    }
  }

  if (vapidKeys) {
    webpush.setVapidDetails(env.VAPID_SUBJECT, vapidKeys.publicKey, vapidKeys.privateKey);
  } else {
    console.warn('⚠️  VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set: push notifications are disabled.');
  }
};

export const getPushPublicKey = (): string | null => vapidKeys?.publicKey ?? null;

/**
 * Sends a push notification to every device the user subscribed. Expired subscriptions are removed.
 * Never throws: push is best-effort on top of the live socket events.
 */
export const sendPush = async (userId: string, payload: PushPayload): Promise<number> => {
  if (!vapidKeys) return 0;

  try {
    const { rows } = await query(
      'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
      [userId]
    );

    const results = await Promise.all(
      rows.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload),
            { TTL: 6 * 60 * 60, urgency: 'high' }
          );
          return true;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
          } else if (!env.isTest) {
            console.warn(`[push] delivery failed (${status ?? 'network'}) for user ${userId}`);
          }
          return false;
        }
      })
    );
    return results.filter(Boolean).length;
  } catch (error) {
    if (!env.isTest) console.error('[push] error:', error);
    return 0;
  }
};
