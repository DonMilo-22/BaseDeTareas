import { Client, Receiver } from '@upstash/qstash';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { AppError } from './errors.js';

let client;
let receiver;

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
  const result = await qstashClient().publishJSON({
    url: `${config.appUrl}/api/reminder-deliveries/${encodeURIComponent(reminderId)}`,
    body: { schedule_version: scheduleVersion },
    notBefore: Math.floor(new Date(remindAt).getTime() / 1000),
    deduplicationId: `personal-reminder-${reminderId}-${scheduleVersion}`,
    retries: 3,
  });
  return result.messageId;
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

export async function verifyQstashRequest({ signature, body, url }) {
  if (process.env.NODE_ENV === 'test') return signature === 'test-qstash-signature';
  if (!signature) return false;
  try {
    return await qstashReceiver().verify({ signature, body, url, clockTolerance: 5 });
  } catch {
    return false;
  }
}
