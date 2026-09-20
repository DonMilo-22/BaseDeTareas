import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { logActivity } from '../activity.js';
import { getDb } from '../db.js';
import { cancelReminderEmail, scheduleAnnouncementReminderEmail } from '../email.js';
import { AppError, forbidden, notFound } from '../errors.js';
import { asyncRoute } from '../middleware.js';
import { requireMembership } from '../permissions.js';
import { sendPushToGroup } from '../push.js';
import { idSchema, isoDateSchema, parse } from '../validation.js';

const router = Router({ mergeParams: true });
const scheduleWindowMs = 29 * 24 * 60 * 60 * 1000;
router.use(asyncRoute(requireUser));

const announcementSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  event_at: z.union([isoDateSchema, z.null()]).optional(),
});

async function announcementInGroup(groupId, announcementId) {
  const result = await getDb().execute({
    sql: `SELECT a.*, u.name AS user_name, u.avatar_url, u.avatar_color
          FROM announcements a JOIN users u ON u.id = a.user_id
          WHERE a.id = ? AND a.group_id = ? AND a.deleted_at IS NULL`,
    args: [announcementId, groupId],
  });
  if (!result.rows[0]) throw notFound('Anuncio no encontrado.');
  return result.rows[0];
}

async function createReminder({ announcement, user, remindAt }) {
  if (!remindAt) return null;
  if (!Number(user.email_notifications)) throw new AppError(409, 'Activa los correos en tu perfil antes de crear el recordatorio.', 'EMAIL_DISABLED');
  const time = new Date(remindAt).getTime();
  if (time <= Date.now() + 120_000) throw new AppError(400, 'El recordatorio debe ser al menos dos minutos en el futuro.', 'INVALID_REMINDER_TIME');
  if (announcement.event_at && time > new Date(announcement.event_at).getTime()) throw new AppError(400, 'El recordatorio debe ser anterior a la fecha del anuncio.', 'INVALID_REMINDER_TIME');

  const reminderId = randomUUID();
  const scheduleNow = time <= Date.now() + scheduleWindowMs;
  let providerEmailId = null;
  if (scheduleNow) {
    providerEmailId = await scheduleAnnouncementReminderEmail({
      reminderId,
      to: user.email,
      userName: user.name,
      announcement,
      remindAt,
    });
  }
  const reminder = { id: reminderId, announcement_id: announcement.id, remind_at: remindAt, status: scheduleNow ? 'scheduled' : 'pending' };
  try {
    await getDb().execute({
      sql: `INSERT INTO announcement_reminders
            (id, announcement_id, user_id, remind_at, status, provider_email_id)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [reminderId, announcement.id, user.id, remindAt, reminder.status, providerEmailId],
    });
  } catch (error) {
    await cancelReminderEmail(providerEmailId);
    if (String(error.message).includes('UNIQUE')) throw new AppError(409, 'Ya tienes un recordatorio para este anuncio.', 'REMINDER_EXISTS');
    throw error;
  }
  return reminder;
}

router.get('/', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  await requireMembership(groupId, req.user.id);
  const result = await getDb().execute({
    sql: `SELECT a.id, a.group_id, a.user_id, a.body, a.event_at, a.created_at, a.updated_at,
                 u.name AS user_name, u.avatar_url, u.avatar_color,
                 r.id AS reminder_id, r.remind_at, r.status AS reminder_status
          FROM announcements a JOIN users u ON u.id = a.user_id
          LEFT JOIN announcement_reminders r ON r.announcement_id = a.id AND r.user_id = ?
            AND r.status IN ('pending', 'scheduled')
          WHERE a.group_id = ? AND a.deleted_at IS NULL
          ORDER BY a.event_at IS NULL, a.event_at, a.created_at DESC LIMIT 300`,
    args: [req.user.id, groupId],
  });
  res.json({ announcements: result.rows });
}));

router.post('/', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  await requireMembership(groupId, req.user.id);
  const input = parse(announcementSchema.extend({ remind_at: z.union([isoDateSchema, z.null()]).optional() }), req.body);
  const announcement = { id: randomUUID(), group_id: groupId, user_id: req.user.id, body: input.body, event_at: input.event_at || null };
  await getDb().execute({
    sql: `INSERT INTO announcements (id, group_id, user_id, body, event_at) VALUES (?, ?, ?, ?, ?)`,
    args: [announcement.id, groupId, req.user.id, announcement.body, announcement.event_at],
  });
  let reminder = null;
  try {
    reminder = await createReminder({ announcement, user: req.user, remindAt: input.remind_at || null });
  } catch (error) {
    await getDb().execute({ sql: 'DELETE FROM announcements WHERE id = ?', args: [announcement.id] });
    throw error;
  }
  await logActivity({ groupId, userId: req.user.id, action: 'announcement.created', entityType: 'announcement', entityId: announcement.id, summary: 'Publicó un anuncio.' });
  let pushNotification = { attempted: 0, sent: 0, failed: 0, expired: 0 };
  try {
    pushNotification = await sendPushToGroup(groupId, {
      title: `Nuevo anuncio de ${req.user.name}`,
      body: announcement.body,
      url: `/?group=${encodeURIComponent(groupId)}#announcements`,
      tag: `announcement-${announcement.id}`,
    }, { excludeUserId: req.user.id });
  } catch (error) {
    console.error('El anuncio se creó, pero el aviso push falló:', error);
    pushNotification.failed += 1;
  }
  res.status(201).json({ announcement: { ...announcement, user_name: req.user.name, reminder_id: reminder?.id || null, remind_at: reminder?.remind_at || null, reminder_status: reminder?.status || null }, push_notification: pushNotification });
}));

router.patch('/:announcementId', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  const announcementId = parse(idSchema, req.params.announcementId);
  const membership = await requireMembership(groupId, req.user.id);
  const current = await announcementInGroup(groupId, announcementId);
  if (current.user_id !== req.user.id && !['admin', 'manager'].includes(membership.role)) throw forbidden();
  const input = parse(announcementSchema, req.body);
  await getDb().execute({
    sql: `UPDATE announcements SET body = ?, event_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    args: [input.body, input.event_at || null, announcementId],
  });
  await logActivity({ groupId, userId: req.user.id, action: 'announcement.updated', entityType: 'announcement', entityId: announcementId, summary: 'Actualizó un anuncio.' });
  res.json({ announcement: { ...current, ...input, event_at: input.event_at || null } });
}));

router.delete('/:announcementId', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  const announcementId = parse(idSchema, req.params.announcementId);
  const membership = await requireMembership(groupId, req.user.id);
  const current = await announcementInGroup(groupId, announcementId);
  if (current.user_id !== req.user.id && !['admin', 'manager'].includes(membership.role)) throw forbidden();
  const reminders = await getDb().execute({ sql: `SELECT provider_email_id FROM announcement_reminders WHERE announcement_id = ? AND status = 'scheduled'`, args: [announcementId] });
  await Promise.all(reminders.rows.map(item => cancelReminderEmail(item.provider_email_id)));
  await getDb().batch([
    { sql: 'DELETE FROM announcement_reminders WHERE announcement_id = ?', args: [announcementId] },
    { sql: 'DELETE FROM announcements WHERE id = ?', args: [announcementId] },
  ], 'write');
  await logActivity({ groupId, userId: req.user.id, action: 'announcement.deleted', entityType: 'announcement', entityId: announcementId, summary: 'Eliminó un anuncio.' });
  res.status(204).end();
}));

router.post('/:announcementId/reminder', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  const announcementId = parse(idSchema, req.params.announcementId);
  await requireMembership(groupId, req.user.id);
  const announcement = await announcementInGroup(groupId, announcementId);
  const { remind_at } = parse(z.object({ remind_at: isoDateSchema }), req.body);
  const reminder = await createReminder({ announcement, user: req.user, remindAt: remind_at });
  res.status(201).json({ reminder });
}));

router.delete('/:announcementId/reminder', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  const announcementId = parse(idSchema, req.params.announcementId);
  await requireMembership(groupId, req.user.id);
  await announcementInGroup(groupId, announcementId);
  const result = await getDb().execute({
    sql: `SELECT id, provider_email_id FROM announcement_reminders
          WHERE announcement_id = ? AND user_id = ? AND status IN ('pending', 'scheduled')`,
    args: [announcementId, req.user.id],
  });
  if (!result.rows[0]) throw notFound('Recordatorio no encontrado.');
  await cancelReminderEmail(result.rows[0].provider_email_id);
  await getDb().execute({ sql: `UPDATE announcement_reminders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, args: [result.rows[0].id] });
  res.status(204).end();
}));

export default router;
