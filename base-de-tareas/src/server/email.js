import { Resend } from 'resend';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { AppError } from './errors.js';

const escapeHtml = value => String(value).replace(/[&<>'"]/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

function isDeliverableEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    && !normalized.endsWith('@example.com')
    && !normalized.endsWith('@estudiante.com')
    && !normalized.endsWith('.invalid');
}

export function resolveEmailRecipients(recipients = []) {
  const override = config.emailRecipientOverride.trim().toLowerCase();
  if (override) {
    return recipients.length && isDeliverableEmail(override)
      ? [{ id: 'test', name: 'Prueba de notificaciones', email: override }]
      : [];
  }

  const unique = new Map();
  for (const recipient of recipients) {
    const email = String(recipient.email || '').trim().toLowerCase();
    if (isDeliverableEmail(email) && !unique.has(email)) unique.set(email, { ...recipient, email });
  }
  return [...unique.values()];
}

function emailClient() {
  if (!config.resendApiKey || !config.emailFrom) {
    throw new AppError(503, 'Los correos todavía no están configurados.', 'EMAIL_NOT_CONFIGURED');
  }
  return new Resend(config.resendApiKey);
}

async function sendEmail({ to, subject, text, html, idempotencyKey, scheduledAt }) {
  if (process.env.NODE_ENV === 'test') return `test-email-${randomUUID()}`;
  const { data, error } = await emailClient().emails.send({
    from: config.emailFrom,
    to: [to],
    subject,
    text,
    html,
    ...(scheduledAt ? { scheduledAt } : {}),
  }, { idempotencyKey });
  if (error) throw new AppError(502, 'No se pudo enviar el correo.', 'EMAIL_PROVIDER_ERROR');
  return data.id;
}

function taskCard(task) {
  const taskUrl = `${config.appUrl}/?group=${encodeURIComponent(task.group_id)}&task=${encodeURIComponent(task.id)}`;
  return {
    taskUrl,
    html: `<div style="padding:20px;border:1px solid #e4e7ec;border-radius:14px">
      <strong>${escapeHtml(task.title)}</strong>
      <p style="margin-bottom:0;color:#667085">${escapeHtml(task.class_name)} · Entrega: ${escapeHtml(task.due_at)}</p>
    </div>`,
  };
}

export async function sendTaskCreatedNotifications({ task, recipients, creatorName }) {
  const targets = resolveEmailRecipients(recipients);
  const results = [];
  const card = taskCard(task);
  for (const recipient of targets) {
    try {
      const providerId = await sendEmail({
        to: recipient.email,
        subject: `Nueva tarea: ${task.title}`,
        idempotencyKey: `task-created-${task.id}-${recipient.id}`,
        text: `${creatorName || 'Un integrante'} agregó la tarea "${task.title}" en ${task.class_name}. Entrega: ${task.due_at}. ${card.taskUrl}`,
        html: `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:auto;color:#172033">
          <p style="color:#667085">Base de Tareas</p><h1 style="font-size:24px">Nueva tarea</h1>
          <p>Hola, ${escapeHtml(recipient.name || 'estudiante')}. ${escapeHtml(creatorName || 'Un integrante')} agregó una entrega.</p>
          ${card.html}<p><a href="${card.taskUrl}" style="display:inline-block;padding:12px 18px;background:#4f46e5;color:white;text-decoration:none;border-radius:10px">Ver tarea</a></p>
        </div>`,
      });
      results.push({ recipient, providerId });
    } catch (error) {
      results.push({ recipient, error });
    }
  }
  return {
    attempted: targets.length,
    sent: results.filter(item => item.providerId).length,
    failed: results.filter(item => item.error).length,
    results,
  };
}

export async function sendAutomaticDueReminder({ task, recipient }) {
  const card = taskCard(task);
  return sendEmail({
    to: recipient.email,
    subject: `Recordatorio: ${task.title} vence pronto`,
    idempotencyKey: `due-24h-${task.id}-${recipient.id}`,
    text: `La tarea "${task.title}" de ${task.class_name} vence el ${task.due_at}. ${card.taskUrl}`,
    html: `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:auto;color:#172033">
      <p style="color:#667085">Base de Tareas</p><h1 style="font-size:24px">Entrega próxima</h1>
      <p>Hola, ${escapeHtml(recipient.name || 'estudiante')}. Esta tarea sigue pendiente y vence en menos de 24 horas.</p>
      ${card.html}<p><a href="${card.taskUrl}" style="display:inline-block;padding:12px 18px;background:#4f46e5;color:white;text-decoration:none;border-radius:10px">Abrir Base de Tareas</a></p>
    </div>`,
  });
}

export async function scheduleReminderEmail({ reminderId, to, userName, task, remindAt }) {
  const [recipient] = resolveEmailRecipients([{ id: 'personal', name: userName, email: to }]);
  if (!recipient) throw new AppError(400, 'El correo no es válido para recibir recordatorios.', 'INVALID_EMAIL');
  const card = taskCard(task);
  return sendEmail({
    to: recipient.email,
    subject: `Recordatorio: ${task.title}`,
    scheduledAt: remindAt,
    idempotencyKey: `reminder-${reminderId}`,
    text: `Hola ${userName}. Este es tu recordatorio para la tarea "${task.title}" de ${task.class_name}. Se entrega el ${task.due_at}. ${card.taskUrl}`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:auto;color:#172033">
        <p style="color:#667085">Base de Tareas</p>
        <h1 style="font-size:24px">Hola, ${escapeHtml(userName)}</h1>
        <p>Este es el recordatorio que programaste para:</p>
        ${card.html}
        <p><a href="${card.taskUrl}" style="display:inline-block;padding:12px 18px;background:#4f46e5;color:white;text-decoration:none;border-radius:10px">Ver tarea</a></p>
      </div>`,
  });
}

export async function cancelReminderEmail(providerEmailId) {
  if (!providerEmailId || process.env.NODE_ENV === 'test') return;
  if (!config.resendApiKey) return;
  const resend = new Resend(config.resendApiKey);
  const { error } = await resend.emails.cancel(providerEmailId);
  if (error) throw new AppError(502, 'No se pudo cancelar el correo programado.', 'EMAIL_PROVIDER_ERROR');
}
