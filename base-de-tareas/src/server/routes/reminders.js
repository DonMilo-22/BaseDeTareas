import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { getDb } from '../db.js';
import { cancelReminderEmail, scheduleReminderEmail } from '../email.js';
import { AppError, notFound } from '../errors.js';
import { asyncRoute } from '../middleware.js';
import { requireMembership } from '../permissions.js';
import { taskInGroup } from '../resources.js';
import { idSchema, isoDateSchema, parse } from '../validation.js';

const router = Router({ mergeParams: true });
router.use(asyncRoute(requireUser));

router.post('/:taskId/reminders', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  const taskId = parse(idSchema, req.params.taskId);
  await requireMembership(groupId, req.user.id);
  const task = await taskInGroup(groupId, taskId);
  const { remind_at } = parse(z.object({ remind_at: isoDateSchema }), req.body);
  const reminderTime = new Date(remind_at).getTime();
  if (reminderTime <= Date.now() + 120_000) throw new AppError(400, 'El recordatorio debe ser al menos dos minutos en el futuro.', 'INVALID_REMINDER_TIME');
  if (reminderTime > new Date(task.due_at).getTime()) throw new AppError(400, 'El recordatorio debe ser anterior a la entrega.', 'INVALID_REMINDER_TIME');
  if (!Number(req.user.email_notifications)) throw new AppError(409, 'Activa los correos en tu perfil antes de crear el recordatorio.', 'EMAIL_DISABLED');

  const reminderId = randomUUID();
  const providerEmailId = await scheduleReminderEmail({ reminderId, to: req.user.email, userName: req.user.name, task, remindAt: remind_at });
  try {
    await getDb().execute({
      sql: `INSERT INTO reminders (id, task_id, user_id, remind_at, status, provider_email_id)
            VALUES (?, ?, ?, ?, 'scheduled', ?)`,
      args: [reminderId, taskId, req.user.id, remind_at, providerEmailId],
    });
  } catch (error) {
    await cancelReminderEmail(providerEmailId).catch(() => {});
    if (String(error.message).includes('UNIQUE')) throw new AppError(409, 'Ya tienes un recordatorio a esa hora.', 'REMINDER_EXISTS');
    throw error;
  }
  res.status(201).json({ reminder: { id: reminderId, task_id: taskId, remind_at, status: 'scheduled' } });
}));

router.delete('/:taskId/reminders/:reminderId', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  const taskId = parse(idSchema, req.params.taskId);
  const reminderId = parse(idSchema, req.params.reminderId);
  await requireMembership(groupId, req.user.id);
  await taskInGroup(groupId, taskId, true);
  const result = await getDb().execute({
    sql: `SELECT provider_email_id, status FROM reminders WHERE id = ? AND task_id = ? AND user_id = ?`,
    args: [reminderId, taskId, req.user.id],
  });
  const reminder = result.rows[0];
  if (!reminder) throw notFound('Recordatorio no encontrado.');
  if (reminder.status === 'scheduled') await cancelReminderEmail(reminder.provider_email_id);
  await getDb().execute({ sql: `UPDATE reminders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, args: [reminderId] });
  res.status(204).end();
}));

export default router;
