import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { getDb } from '../db.js';
import { AppError, notFound } from '../errors.js';
import { asyncRoute } from '../middleware.js';
import {
  cancelPersonalReminderDeliveries,
  getPersonalReminder,
  personalReminderCapabilities,
  reminderTarget,
  schedulePersonalReminderChannels,
} from '../personal-reminders.js';
import { requireMembership } from '../permissions.js';
import { sendPushToUsers } from '../push.js';
import { qstashConfigured, verifyQstashRequest } from '../qstash.js';
import { idSchema, isoDateSchema, parse } from '../validation.js';

const router = Router({ mergeParams: true });
const deliveryRouter = Router();
const optionalId = z.union([idSchema, z.literal(''), z.null()]).optional().transform(value => value || null);
const reminderSchema = z.object({
  message: z.string().trim().min(1).max(500),
  remind_at: isoDateSchema,
  email_enabled: z.boolean(),
  push_enabled: z.boolean(),
  task_id: optionalId,
  announcement_id: optionalId,
}).refine(value => value.email_enabled || value.push_enabled, {
  message: 'Selecciona correo, notificación push o ambos.',
  path: ['channels'],
}).refine(value => !(value.task_id && value.announcement_id), {
  message: 'Un recordatorio solo puede vincularse con una tarea o un anuncio.',
  path: ['reference'],
});

async function assertReference(groupId, { task_id: taskId, announcement_id: announcementId }) {
  if (taskId) {
    const result = await getDb().execute({
      sql: `SELECT id FROM tasks WHERE id = ? AND group_id = ? AND deleted_at IS NULL`,
      args: [taskId, groupId],
    });
    if (!result.rows[0]) throw notFound('La tarea seleccionada ya no está disponible.');
  }
  if (announcementId) {
    const result = await getDb().execute({
      sql: `SELECT id FROM announcements WHERE id = ? AND group_id = ? AND deleted_at IS NULL`,
      args: [announcementId, groupId],
    });
    if (!result.rows[0]) throw notFound('El anuncio seleccionado ya no está disponible.');
  }
}

async function capabilitiesFor(user) {
  const devices = await getDb().execute({
    sql: 'SELECT COUNT(*) AS total FROM push_subscriptions WHERE user_id = ?',
    args: [user.id],
  });
  return personalReminderCapabilities({
    pushDevices: Number(devices.rows[0]?.total || 0),
    emailEnabled: Number(user.email_notifications) === 1,
  });
}

function validateDelivery(input, capabilities) {
  const reminderTime = new Date(input.remind_at).getTime();
  if (reminderTime <= Date.now() + 120_000) {
    throw new AppError(400, 'El recordatorio debe programarse al menos dos minutos en el futuro.', 'INVALID_REMINDER_TIME');
  }
  if (input.email_enabled && !capabilities.email) {
    throw new AppError(409, 'Activa los correos en tu perfil antes de elegir este medio.', 'EMAIL_DISABLED');
  }
  if (input.push_enabled && !capabilities.qstash_configured) {
    throw new AppError(503, 'La programación de notificaciones push aún no está configurada.', 'QSTASH_NOT_CONFIGURED');
  }
  if (input.push_enabled && !capabilities.push_devices) {
    throw new AppError(409, 'Activa las notificaciones push en al menos un dispositivo antes de elegir este medio.', 'PUSH_SUBSCRIPTION_REQUIRED');
  }
}

function serializeReminder(reminder) {
  const target = reminderTarget(reminder);
  return {
    id: reminder.id,
    group_id: reminder.group_id,
    message: reminder.message,
    remind_at: reminder.remind_at,
    email_enabled: Boolean(Number(reminder.email_enabled)),
    push_enabled: Boolean(Number(reminder.push_enabled)),
    email_status: reminder.email_status,
    push_status: reminder.push_status,
    task_id: reminder.task_id || null,
    announcement_id: reminder.announcement_id || null,
    target,
    status: new Date(reminder.remind_at).getTime() <= Date.now()
      ? 'past'
      : (reminder.email_status === 'failed' || reminder.push_status === 'failed' ? 'attention' : 'scheduled'),
    last_error: reminder.last_error || null,
  };
}

router.use(asyncRoute(requireUser));

router.get('/', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  await requireMembership(groupId, req.user.id);
  const [items, capabilities] = await Promise.all([
    getDb().execute({
      sql: `SELECT r.*, u.name AS user_name, u.email, g.name AS group_name,
                   t.title AS task_title, t.due_at AS task_due_at, c.name AS class_name,
                   a.body AS announcement_body, a.event_at AS announcement_event_at
            FROM personal_reminders r
            JOIN users u ON u.id = r.user_id
            JOIN groups g ON g.id = r.group_id
            LEFT JOIN tasks t ON t.id = r.task_id
            LEFT JOIN classes c ON c.id = t.class_id
            LEFT JOIN announcements a ON a.id = r.announcement_id
            WHERE r.user_id = ? AND r.group_id = ?
              AND (datetime(r.remind_at) >= datetime('now', '-30 days') OR r.email_status IN ('pending', 'scheduled') OR r.push_status IN ('pending', 'scheduled'))
            ORDER BY r.remind_at ASC`,
      args: [req.user.id, groupId],
    }),
    capabilitiesFor(req.user),
  ]);
  res.json({ reminders: items.rows.map(serializeReminder), capabilities });
}));

router.post('/', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  await requireMembership(groupId, req.user.id);
  const input = parse(reminderSchema, req.body);
  const capabilities = await capabilitiesFor(req.user);
  validateDelivery(input, capabilities);
  await assertReference(groupId, input);

  const reminderId = randomUUID();
  await getDb().execute({
    sql: `INSERT INTO personal_reminders
          (id, user_id, group_id, task_id, announcement_id, message, remind_at,
           email_enabled, push_enabled, email_status, push_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      reminderId, req.user.id, groupId, input.task_id, input.announcement_id,
      input.message, input.remind_at, Number(input.email_enabled), Number(input.push_enabled),
      input.email_enabled ? 'pending' : 'disabled', input.push_enabled ? 'pending' : 'disabled',
    ],
  });
  const scheduled = await schedulePersonalReminderChannels(reminderId);
  res.status(201).json({ reminder: serializeReminder(scheduled.reminder), warnings: scheduled.errors });
}));

router.patch('/:reminderId', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  const reminderId = parse(idSchema, req.params.reminderId);
  await requireMembership(groupId, req.user.id);
  const input = parse(reminderSchema, req.body);
  const capabilities = await capabilitiesFor(req.user);
  validateDelivery(input, capabilities);
  await assertReference(groupId, input);
  const existing = await getPersonalReminder(reminderId, req.user.id);
  if (!existing || existing.group_id !== groupId) throw notFound('Recordatorio no encontrado.');

  await cancelPersonalReminderDeliveries(existing);
  await getDb().batch([
    {
      sql: `DELETE FROM push_notification_log
            WHERE user_id = ? AND entity_type = 'personal_reminder' AND entity_id = ?`,
      args: [req.user.id, reminderId],
    },
    {
      sql: `UPDATE personal_reminders SET task_id = ?, announcement_id = ?, message = ?, remind_at = ?,
            email_enabled = ?, push_enabled = ?, email_status = ?, push_status = ?,
            provider_email_id = NULL, qstash_message_id = NULL, schedule_version = schedule_version + 1,
            last_error = NULL, delivered_at = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ? AND group_id = ?`,
      args: [
        input.task_id, input.announcement_id, input.message, input.remind_at,
        Number(input.email_enabled), Number(input.push_enabled),
        input.email_enabled ? 'pending' : 'disabled', input.push_enabled ? 'pending' : 'disabled',
        reminderId, req.user.id, groupId,
      ],
    },
  ], 'write');
  const scheduled = await schedulePersonalReminderChannels(reminderId);
  res.json({ reminder: serializeReminder(scheduled.reminder), warnings: scheduled.errors });
}));

router.delete('/:reminderId', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  const reminderId = parse(idSchema, req.params.reminderId);
  await requireMembership(groupId, req.user.id);
  const reminder = await getPersonalReminder(reminderId, req.user.id);
  if (!reminder || reminder.group_id !== groupId) throw notFound('Recordatorio no encontrado.');
  await cancelPersonalReminderDeliveries(reminder);
  await getDb().execute({
    sql: 'DELETE FROM personal_reminders WHERE id = ? AND user_id = ? AND group_id = ?',
    args: [reminderId, req.user.id, groupId],
  });
  res.status(204).end();
}));

deliveryRouter.post('/:reminderId', asyncRoute(async (req, res) => {
  if (!qstashConfigured()) throw new AppError(503, 'QStash no está configurado.', 'QSTASH_NOT_CONFIGURED');
  const reminderId = parse(idSchema, req.params.reminderId);
  const rawBody = req.rawBody || JSON.stringify(req.body || {});
  const signature = String(req.headers['upstash-signature'] || '');
  if (!await verifyQstashRequest({ signature, body: rawBody })) {
    throw new AppError(401, 'Firma de QStash no válida.', 'INVALID_QSTASH_SIGNATURE');
  }
  const delivery = parse(z.object({
    reminder_id: idSchema,
    schedule_version: z.number().int().positive(),
  }), req.body);
  if (delivery.reminder_id !== reminderId) {
    throw new AppError(401, 'El recordatorio firmado no coincide con la ruta de entrega.', 'INVALID_QSTASH_REMINDER');
  }
  const scheduleVersion = delivery.schedule_version;
  const reminder = await getPersonalReminder(reminderId);
  if (!reminder || !Number(reminder.push_enabled) || Number(reminder.schedule_version) !== scheduleVersion
      || !['scheduled', 'pending'].includes(reminder.push_status)) {
    return res.status(204).end();
  }

  const reservation = await getDb().execute({
    sql: `INSERT OR IGNORE INTO push_notification_log
          (user_id, entity_type, entity_id, notification_type)
          VALUES (?, 'personal_reminder', ?, ?)`,
    args: [reminder.user_id, reminder.id, `scheduled_v${scheduleVersion}`],
  });
  if (!Number(reservation.rowsAffected)) return res.status(204).end();

  const target = reminderTarget(reminder);
  try {
    const result = await sendPushToUsers([reminder.user_id], {
      title: 'Recordatorio',
      body: reminder.message,
      url: target.url,
      tag: `personal-reminder-${reminder.id}`,
    });
    if (!result.sent) {
      await getDb().execute({
        sql: `UPDATE personal_reminders SET push_status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND schedule_version = ?`,
        args: ['No hay un dispositivo disponible para recibir la notificación.', reminder.id, scheduleVersion],
      });
      return res.json({ ok: false, delivered: false });
    }
    await getDb().execute({
      sql: `UPDATE personal_reminders SET push_status = 'sent', delivered_at = CURRENT_TIMESTAMP,
            last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND schedule_version = ?`,
      args: [reminder.id, scheduleVersion],
    });
    return res.json({ ok: true, delivered: true });
  } catch (error) {
    await getDb().batch([
      {
        sql: `DELETE FROM push_notification_log
              WHERE user_id = ? AND entity_type = 'personal_reminder' AND entity_id = ? AND notification_type = ?`,
        args: [reminder.user_id, reminder.id, `scheduled_v${scheduleVersion}`],
      },
      {
        sql: `UPDATE personal_reminders SET last_error = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND schedule_version = ?`,
        args: [String(error.message || error).slice(0, 500), reminder.id, scheduleVersion],
      },
    ], 'write');
    throw error;
  }
}));

export { deliveryRouter };
export default router;
