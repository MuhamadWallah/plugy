import { Router, Request, Response } from 'express';
import { query } from '../config/db.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const dbStart = Date.now();
    const result = await query(
      'SELECT 1 + 1 AS calc, NOW() AS db_time, (SELECT COUNT(*) FROM categories) AS category_count;'
    );
    const dbLatencyMs = Date.now() - dbStart;

    return res.status(200).json({
      status: 'ok',
      service: 'plugy-backend',
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        latencyMs: dbLatencyMs,
        dbTime: result.rows[0]?.db_time,
        categoryCount: parseInt(result.rows[0]?.category_count || '0', 10),
      },
      uptimeSeconds: Math.floor(process.uptime()),
    });
  } catch (error) {
    console.error('Health check database error:', error);
    return res.status(503).json({
      status: 'error',
      service: 'plugy-backend',
      timestamp: new Date().toISOString(),
      database: {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown database error',
      },
    });
  }
});

export default router;
