import { Client, Receiver } from '@upstash/qstash';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { AppError } from './errors.js';

let client;
let receiver;

export function qstashErrorMessage(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  const providerMessage = String(error?.message || error || '').trim();
  if (status === 401 || status === 403) {
    return 'QStash rechazó la autorización. Revisa que QSTASH_TOKEN pertenezca al mismo proyecto de QStash y vuelve a desplegar.';
  }
  if (status === 429) {
    return 'QStash alcanzó temporalmente el límite de solicitudes. Intenta nuevamente en unos minutos.';
  }
  if (status === 400 && /delay|not.?before|future|seven|7 day/i.test(providerMessage)) {
    return 'QStash rechazó la fecha programada porque está fuera del intervalo permitido por el plan.';
  }
  if (status === 400 && /url|destination/i.test(providerMessage)) {
    return 'QStash rechazó la URL de entrega. APP_URL debe ser la dirección HTTPS pública de producción.';
  }
  if (/fetch failed|network|timeout|timed out/i.test(providerMessage)) {
    return 'No se pudo conectar con QStash. Intenta nuevamente en unos minutos.';
  }
  const safeDetail = providerMessage.replace(/Bearer\s+\S+/gi, 'Bearer [oculto]').slice(0, 240);
  return safeDetail ? `QStash no aceptó el recordatorio: ${safeDetail}` : 'QStash no aceptó el recordatorio por una causa desconocida.';
}

export function qstashConfigured() {
  return Boolean(config.qstashToken && config.qstashCurrentSigningKey && config.qstashNextSigningKey && config.appUrl.startsWith('https://'))
    || process.env.NODE_ENV === 'test';
}

function qstashClient() {
  if (!qstashConfigured()) throw new AppError(503, 'La programación de notificaciones push aún no está configurada.', 'QSTASH_NOT_CONFIGURED');
  if (!client) client = new Client({ token: config.qstashToken, enableTelemetry: false });
  return client;
}

function qstashReceiver() {
  if (!qstashConfigured()) throw new AppError(503, 'La programación de notificaciones push aún no está configurada.', 'QSTASH_NOT_CONFIGURED');
  if (!receiver) receiver = new Receiver({
    currentSigningKey: config.qstashCurrentSigningKey,
    nextSigningKey: config.qstashNextSigningKey,
  });
  return receiver;
}

export async function schedulePushDelivery({ reminderId, scheduleVersion, remindAt }) {
  if (process.env.NODE_ENV === 'test') return `test-qstash-${randomUUID()}`;
  try {
    const result = await qstashClient().publishJSON({
      url: `${config.appUrl}/api/reminder-deliveries/${encodeURIComponent(reminderId)}`,
      body: { reminder_id: reminderId, schedule_version: scheduleVersion },
      notBefore: Math.floor(new Date(remindAt).getTime() / 1000),
      deduplicationId: `personal-reminder-${reminderId}-${scheduleVersion}`,
      retries: 3,
    });
    if (!result?.messageId) throw new Error('QStash no devolvió un identificador de mensaje.');
    return result.messageId;
  } catch (error) {
    throw new AppError(502, qstashErrorMessage(error), 'QSTASH_SCHEDULE_FAILED');
  }
}

export async function cancelPushDelivery(messageId) {
  if (!messageId || process.env.NODE_ENV === 'test' || !config.qstashToken) return true;
  try {
    await qstashClient().messages.cancel(messageId);
    return true;
  } catch (error) {
    console.warn('QStash no permitió cancelar el aviso; la versión del recordatorio impedirá una entrega obsoleta.', error);
    return false;
  }
}

export async function verifyQstashRequest({ signature, body }) {
  if (process.env.NODE_ENV === 'test') return signature === 'test-qstash-signature';
  if (!signature) return false;
  try {
    // Vercel puede reescribir el host o la ruta antes de entregar la petición.
    // La firma sigue validando el cuerpo exacto, que incluye el id del recordatorio.
    return await qstashReceiver().verify({ signature, body, clockTolerance: 5 });
  } catch {
    return false;
  }
}
