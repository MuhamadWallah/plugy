import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { query } from '../config/db.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { getPushPublicKey } from '../services/push.service.js';

/**
 * GET /api/config: public client settings
 */
export const configRouter = Router();

configRouter.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    emergencyNumber: env.EMERGENCY_NUMBER,
    pushPublicKey: getPushPublicKey(),
  });
});

/**
 * /api/push: Web Push subscriptions for the signed-in user's devices
 */
export const pushRouter = Router();

const base64url = z.string().min(8).max(200).regex(/^[A-Za-z0-9_-]+=*$/);
const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith('https://'), 'Push endpoint must use HTTPS'),
  keys: z.object({ p256dh: base64url, auth: base64url }),
});

pushRouter.post('/subscribe', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!getPushPublicKey()) {
      return res.status(503).json({ error: 'Push notifications are not enabled on this server' });
    }
    const parsed = subscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid push subscription' });
    }
    const { endpoint, keys } = parsed.data;

    // A device belongs to whoever is signed in on it now
    await query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE
         SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
             user_agent = EXCLUDED.user_agent, created_at = NOW()`,
      [req.user!.id, endpoint, keys.p256dh, keys.auth, (req.headers['user-agent'] || '').slice(0, 300)]
    );
    return res.status(201).json({ message: 'Notifications enabled on this device' });
  } catch (error) {
    console.error('Push subscribe error:', error);
    return res.status(500).json({ error: 'Could not enable notifications' });
  }
});

pushRouter.post('/unsubscribe', requireAuth, async (req: Request, res: Response) => {
  try {
    const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : null;
    if (!endpoint) {
      return res.status(400).json({ error: 'endpoint is required' });
    }
    await query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [endpoint, req.user!.id]);
    return res.status(200).json({ message: 'Notifications disabled on this device' });
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    return res.status(500).json({ error: 'Could not disable notifications' });
  }
});
