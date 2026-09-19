import { Router } from 'express';
import { config } from '../config.js';
import { getDb } from '../db.js';
import { scheduleReminderEmail } from '../email.js';
import { AppError } from '../errors.js';
import { asyncRoute } from '../middleware.js';

const router = Router();
const scheduleWindowMs = 29 * 24 * 60 * 60 * 1000;

function requireCron(req, _res, next) {
  if (!config.cronSecret || req.headers.authorization !== `Bearer ${config.cronSecret}`) {
    throw new AppError(401, 'Cron no autorizado.', 'UNAUTHORIZED');
  }
  next();
}

router.get('/reminders', requireCron, asyncRoute(async (_req, res) => {
  const now = new Date();
  const horizon = new Date(now.getTime() + scheduleWindowMs).toISOString();
  const expired = await getDb().execute({
    sql: `UPDATE reminders SET status = 'failed', last_error = 'La fecha del recordatorio ya pasó.',
          updated_at = CURRENT_TIMESTAMP WHERE status = 'pending' AND remind_at <= ?`,
    args: [now.toISOString()],
  });
  const result = await getDb().execute({
    sql: `SELECT r.id, r.remind_at, u.email, u.name AS user_name,
                 t.id AS task_id, t.group_id, t.title, t.due_at, c.name AS class_name
          FROM reminders r
          JOIN users u ON u.id = r.user_id
          JOIN tasks t ON t.id = r.task_id
          JOIN classes c ON c.id = t.class_id
          WHERE r.status = 'pending' AND r.remind_at > ? AND r.remind_at <= ?
            AND u.deleted_at IS NULL AND u.email_notifications = 1
            AND t.deleted_at IS NULL AND c.deleted_at IS NULL
          ORDER BY r.remind_at LIMIT 100`,
    args: [now.toISOString(), horizon],
  });

  let scheduled = 0;
  let failed = 0;
  for (const item of result.rows) {
    try {
      const providerEmailId = await scheduleReminderEmail({
        reminderId: item.id,
        to: item.email,
        userName: item.user_name,
        task: {
          id: item.task_id,
          group_id: item.group_id,
          title: item.title,
          due_at: item.due_at,
          class_name: item.class_name,
        },
        remindAt: item.remind_at,
      });
      await getDb().execute({
        sql: `UPDATE reminders SET status = 'scheduled', provider_email_id = ?, attempts = attempts + 1,
              last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'`,
        args: [providerEmailId, item.id],
      });
      scheduled += 1;
    } catch (error) {
      failed += 1;
      await getDb().execute({
        sql: `UPDATE reminders SET attempts = attempts + 1, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        args: [String(error.message || error).slice(0, 500), item.id],
      });
    }
  }

  res.json({ ok: true, queued: result.rows.length, scheduled, failed, expired: Number(expired.rowsAffected) });
}));

export default router;
