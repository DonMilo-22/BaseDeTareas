import { Router } from 'express';
import { config } from '../config.js';
import { getDb } from '../db.js';
import {
  resolveEmailRecipients,
  scheduleReminderEmail,
  sendAutomaticDueReminder,
} from '../email.js';
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

  const dueHorizon = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const dueSoon = await getDb().execute({
    sql: `SELECT t.id, t.group_id, t.title, t.due_at, c.name AS class_name,
                 u.id AS user_id, u.name AS user_name, u.email
          FROM tasks t
          JOIN classes c ON c.id = t.class_id
          JOIN group_members gm ON gm.group_id = t.group_id
          JOIN users u ON u.id = gm.user_id
          LEFT JOIN task_completions tc ON tc.task_id = t.id AND tc.user_id = u.id
          WHERE t.deleted_at IS NULL AND c.deleted_at IS NULL
            AND u.deleted_at IS NULL AND u.email_notifications = 1
            AND tc.task_id IS NULL AND t.due_at > ? AND t.due_at <= ?
          ORDER BY t.due_at LIMIT 500`,
    args: [now.toISOString(), dueHorizon],
  });

  let automaticSent = 0;
  let automaticSkipped = 0;
  let automaticFailed = 0;
  for (const source of dueSoon.rows) {
    const [recipient] = resolveEmailRecipients([{
      id: source.user_id,
      name: source.user_name,
      email: source.email,
    }]);
    if (!recipient) continue;
    const reservation = await getDb().execute({
      sql: `INSERT OR IGNORE INTO email_notifications
            (task_id, user_id, notification_type, recipient_email)
            VALUES (?, ?, 'due_24h', ?)`,
      args: [source.id, recipient.id, recipient.email],
    });
    if (!Number(reservation.rowsAffected)) {
      automaticSkipped += 1;
      continue;
    }
    try {
      const providerId = await sendAutomaticDueReminder({
        task: {
          id: source.id,
          group_id: source.group_id,
          title: source.title,
          due_at: source.due_at,
          class_name: source.class_name,
        },
        recipient,
      });
      await getDb().execute({
        sql: `UPDATE email_notifications SET provider_id = ?, sent_at = CURRENT_TIMESTAMP
              WHERE task_id = ? AND user_id = ? AND notification_type = 'due_24h'`,
        args: [providerId, source.id, recipient.id],
      });
      automaticSent += 1;
    } catch (error) {
      automaticFailed += 1;
      await getDb().execute({
        sql: `DELETE FROM email_notifications
              WHERE task_id = ? AND user_id = ? AND notification_type = 'due_24h'`,
        args: [source.id, recipient.id],
      });
    }
  }

  res.json({
    ok: true,
    queued: result.rows.length,
    scheduled,
    failed,
    expired: Number(expired.rowsAffected),
    personal: { queued: result.rows.length, scheduled, failed, expired: Number(expired.rowsAffected) },
    automatic: {
      tasks_due_soon: new Set(dueSoon.rows.map(item => item.id)).size,
      sent: automaticSent,
      skipped: automaticSkipped,
      failed: automaticFailed,
    },
  });
}));

export default router;
