import { Resend } from 'resend';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { AppError } from './errors.js';

const escapeHtml = value => String(value).replace(/[&<>'"]/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

export async function scheduleReminderEmail({ reminderId, to, userName, task, remindAt }) {
  if (process.env.NODE_ENV === 'test') return `test-email-${randomUUID()}`;
  if (!config.resendApiKey || !config.emailFrom) {
    throw new AppError(503, 'Los recordatorios por correo todavía no están configurados.', 'EMAIL_NOT_CONFIGURED');
  }
  const resend = new Resend(config.resendApiKey);
  const taskUrl = `${config.appUrl}/?group=${encodeURIComponent(task.group_id)}&task=${encodeURIComponent(task.id)}`;
  const { data, error } = await resend.emails.send({
    from: config.emailFrom,
    to: [to],
    subject: `Recordatorio: ${task.title}`,
    scheduledAt: remindAt,
    tags: [{ name: 'reminder_id', value: reminderId.replaceAll('-', '') }],
    text: `Hola ${userName}. Este es tu recordatorio para la tarea "${task.title}" de ${task.class_name}. Se entrega el ${task.due_at}. ${taskUrl}`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:auto;color:#172033">
        <p style="color:#667085">Base de Tareas</p>
        <h1 style="font-size:24px">Hola, ${escapeHtml(userName)}</h1>
        <p>Este es el recordatorio que programaste para:</p>
        <div style="padding:20px;border:1px solid #e4e7ec;border-radius:14px">
          <strong>${escapeHtml(task.title)}</strong>
          <p style="margin-bottom:0;color:#667085">${escapeHtml(task.class_name)} · Entrega: ${escapeHtml(task.due_at)}</p>
        </div>
        <p><a href="${taskUrl}" style="display:inline-block;padding:12px 18px;background:#4f46e5;color:white;text-decoration:none;border-radius:10px">Ver tarea</a></p>
      </div>`,
  }, { idempotencyKey: `reminder-${reminderId}` });
  if (error) throw new AppError(502, 'No se pudo programar el correo.', 'EMAIL_PROVIDER_ERROR');
  return data.id;
}

export async function cancelReminderEmail(providerEmailId) {
  if (!providerEmailId || process.env.NODE_ENV === 'test') return;
  if (!config.resendApiKey) return;
  const resend = new Resend(config.resendApiKey);
  const { error } = await resend.emails.cancel(providerEmailId);
  if (error) throw new AppError(502, 'No se pudo cancelar el correo programado.', 'EMAIL_PROVIDER_ERROR');
}
