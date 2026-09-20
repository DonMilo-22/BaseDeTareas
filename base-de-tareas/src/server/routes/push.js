import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { config } from '../config.js';
import { getDb } from '../db.js';
import { AppError } from '../errors.js';
import { asyncRoute } from '../middleware.js';
import { pushConfigured, sendPushToUsers } from '../push.js';
import { parse } from '../validation.js';

const router = Router();
router.use(asyncRoute(requireUser));

const endpointSchema = z.string().trim().url().max(4096).refine(value => new URL(value).protocol === 'https:', 'El endpoint debe utilizar HTTPS.');
const subscriptionSchema = z.object({
  endpoint: endpointSchema,
  keys: z.object({
    p256dh: z.string().trim().min(20).max(1024),
    auth: z.string().trim().min(8).max(512),
  }),
});

router.get('/config', asyncRoute(async (req, res) => {
  const count = await getDb().execute({
    sql: 'SELECT COUNT(*) AS total FROM push_subscriptions WHERE user_id = ?',
    args: [req.user.id],
  });
  res.json({
    configured: pushConfigured(),
    public_key: pushConfigured() ? config.vapidPublicKey : null,
    devices: Number(count.rows[0]?.total || 0),
  });
}));

router.post('/subscriptions', asyncRoute(async (req, res) => {
  if (!pushConfigured()) throw new AppError(503, 'Las notificaciones push aún no están configuradas.', 'PUSH_NOT_CONFIGURED');
  const subscription = parse(subscriptionSchema, req.body);
  const id = randomUUID();
  await getDb().execute({
    sql: `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh,
            auth = excluded.auth, user_agent = excluded.user_agent, updated_at = CURRENT_TIMESTAMP`,
    args: [id, req.user.id, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, String(req.headers['user-agent'] || '').slice(0, 500)],
  });
  res.status(201).json({ subscribed: true });
}));

router.delete('/subscriptions', asyncRoute(async (req, res) => {
  const { endpoint } = parse(z.object({ endpoint: endpointSchema }), req.body);
  await getDb().execute({
    sql: 'DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?',
    args: [endpoint, req.user.id],
  });
  res.status(204).end();
}));

router.post('/test', asyncRoute(async (req, res) => {
  if (!pushConfigured()) throw new AppError(503, 'Las notificaciones push aún no están configuradas.', 'PUSH_NOT_CONFIGURED');
  const result = await sendPushToUsers([req.user.id], {
    title: 'Notificaciones activadas',
    body: 'Base de Tareas puede enviarte avisos en este dispositivo.',
    url: '/#settings',
    tag: 'push-test',
  });
  if (!result.attempted) throw new AppError(409, 'Primero activa las notificaciones en este dispositivo.', 'PUSH_SUBSCRIPTION_REQUIRED');
  res.json(result);
}));

export default router;
