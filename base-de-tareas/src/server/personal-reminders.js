import { getDb } from './db.js';
import { cancelReminderEmail, schedulePersonalReminderEmail } from './email.js';
import { cancelPushDelivery, qstashConfigured, schedulePushDelivery } from './qstash.js';

export const emailScheduleWindowMs = 29 * 24 * 60 * 60 * 1000;
export const pushScheduleWindowMs = 7 * 24 * 60 * 60 * 1000;

export async function getPersonalReminder(reminderId, userId) {
  const result = await getDb().execute({
    sql: `SELECT r.*, u.name AS user_name, u.email,
                 g.name AS group_name,
                 t.title AS task_title, t.due_at AS task_due_at, c.name AS class_name,
                 a.body AS announcement_body, a.event_at AS announcement_event_at
          FROM personal_reminders r
          JOIN users u ON u.id = r.user_id
          JOIN groups g ON g.id = r.group_id
          LEFT JOIN tasks t ON t.id = r.task_id
          LEFT JOIN classes c ON c.id = t.class_id
          LEFT JOIN announcements a ON a.id = r.announcement_id
          WHERE r.id = ? ${userId ? 'AND r.user_id = ?' : ''}`,
    args: userId ? [reminderId, userId] : [reminderId],
  });
  return result.rows[0] || null;
}

export function reminderTarget(reminder) {
  if (reminder.task_id) {
    return {
      type: 'task',
      title: reminder.task_title || 'Tarea',
      detail: [reminder.class_name, reminder.task_due_at ? `Entrega: ${reminder.task_due_at}` : ''].filter(Boolean).join(' · '),
      url: `/?group=${encodeURIComponent(reminder.group_id)}&task=${encodeURIComponent(reminder.task_id)}#tasks`,
    };
  }
  if (reminder.announcement_id) {
    return {
      type: 'announcement',
      title: 'Anuncio del grupo',
      detail: reminder.announcement_body || '',
      url: `/?group=${encodeURIComponent(reminder.group_id)}#announcements`,
    };
  }
  return {
    type: 'personal',
    title: 'Recordatorio personal',
    detail: reminder.group_name || '',
    url: `/?group=${encodeURIComponent(reminder.group_id)}#reminders`,
  };
}

export async function cancelPersonalReminderDeliveries(reminder) {
  await Promise.all([
    cancelReminderEmail(reminder.provider_email_id),
    cancelPushDelivery(reminder.qstash_message_id),
  ]);
}

export async function schedulePersonalReminderChannels(reminderId) {
  let reminder = await getPersonalReminder(reminderId);
  if (!reminder) return null;
  const now = Date.now();
  const reminderTime = new Date(reminder.remind_at).getTime();
  const errors = [];

  if (Number(reminder.email_enabled) && reminder.email_status === 'pending' && reminderTime <= now + emailScheduleWindowMs) {
    try {
      const providerEmailId = await schedulePersonalReminderEmail({
        reminderId: reminder.id,
        scheduleVersion: Number(reminder.schedule_version),
        to: reminder.email,
        userName: reminder.user_name,
        message: reminder.message,
        remindAt: reminder.remind_at,
        target: reminderTarget(reminder),
      });
      await getDb().execute({
        sql: `UPDATE personal_reminders SET email_status = 'scheduled', provider_email_id = ?,
              last_error = NULL, updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND schedule_version = ? AND email_status = 'pending'`,
        args: [providerEmailId, reminder.id, reminder.schedule_version],
      });
    } catch (error) {
      errors.push(`Correo: ${error.message || error}`);
      await getDb().execute({
        sql: `UPDATE personal_reminders SET email_status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND schedule_version = ?`,
        args: [String(error.message || error).slice(0, 500), reminder.id, reminder.schedule_version],
      });
    }
  }

  reminder = await getPersonalReminder(reminderId);
  if (Number(reminder?.push_enabled) && reminder.push_status === 'pending' && reminderTime <= now + pushScheduleWindowMs) {
    try {
      const qstashMessageId = await schedulePushDelivery({
        reminderId: reminder.id,
        scheduleVersion: Number(reminder.schedule_version),
        remindAt: reminder.remind_at,
      });
      await getDb().execute({
        sql: `UPDATE personal_reminders SET push_status = 'scheduled', qstash_message_id = ?,
              last_error = NULL, updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND schedule_version = ? AND push_status = 'pending'`,
        args: [qstashMessageId, reminder.id, reminder.schedule_version],
      });
    } catch (error) {
      errors.push(`Push: ${error.message || error}`);
      await getDb().execute({
        sql: `UPDATE personal_reminders SET push_status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND schedule_version = ?`,
        args: [String(error.message || error).slice(0, 500), reminder.id, reminder.schedule_version],
      });
    }
  }

  return { reminder: await getPersonalReminder(reminderId), errors };
}

export async function schedulePendingPersonalReminders(now = new Date()) {
  const emailHorizon = new Date(now.getTime() + emailScheduleWindowMs).toISOString();
  const pushHorizon = new Date(now.getTime() + pushScheduleWindowMs).toISOString();
  await getDb().execute({
    sql: `UPDATE personal_reminders
          SET email_status = CASE WHEN email_status = 'pending' THEN 'failed' ELSE email_status END,
              push_status = CASE WHEN push_status = 'pending' THEN 'failed' ELSE push_status END,
              last_error = 'La fecha del recordatorio ya pasó.', updated_at = CURRENT_TIMESTAMP
          WHERE remind_at <= ? AND (email_status = 'pending' OR push_status = 'pending')`,
    args: [now.toISOString()],
  });
  await getDb().execute({
    sql: `UPDATE personal_reminders SET email_status = 'sent', updated_at = CURRENT_TIMESTAMP
          WHERE email_status = 'scheduled' AND remind_at <= ?`,
    args: [now.toISOString()],
  });

  const pending = await getDb().execute({
    sql: `SELECT id FROM personal_reminders
          WHERE remind_at > ? AND ((email_status = 'pending' AND remind_at <= ?)
            OR (push_status = 'pending' AND remind_at <= ?))
          ORDER BY remind_at LIMIT 200`,
    args: [now.toISOString(), emailHorizon, pushHorizon],
  });
  let scheduled = 0;
  let failed = 0;
  for (const row of pending.rows) {
    const result = await schedulePersonalReminderChannels(row.id);
    if (result?.errors.length) failed += 1;
    else scheduled += 1;
  }
  return { queued: pending.rows.length, scheduled, failed };
}

export function personalReminderCapabilities({ pushDevices = 0, emailEnabled = false } = {}) {
  return {
    email: Boolean(emailEnabled),
    push: qstashConfigured() && Number(pushDevices) > 0,
    push_devices: Number(pushDevices),
    qstash_configured: qstashConfigured(),
  };
}
