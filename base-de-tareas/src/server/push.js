import webpush from 'web-push';
import { config } from './config.js';
import { getDb } from './db.js';

const configured = Boolean(config.vapidPublicKey && config.vapidPrivateKey);

if (configured) {
  webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
}

export function pushConfigured() {
  return configured;
}

function payloadJson(payload) {
  return JSON.stringify({
    title: String(payload.title || 'Base de Tareas').slice(0, 120),
    body: String(payload.body || '').slice(0, 500),
    url: String(payload.url || '/').slice(0, 2048),
    tag: String(payload.tag || 'base-de-tareas').slice(0, 120),
  });
}

async function removeExpiredSubscription(id) {
  await getDb().execute({ sql: 'DELETE FROM push_subscriptions WHERE id = ?', args: [id] });
}

async function deliver(subscriptions, payload) {
  const result = { attempted: subscriptions.length, sent: 0, failed: 0, expired: 0 };
  if (!configured || !subscriptions.length) return result;
  const body = payloadJson(payload);

  await Promise.all(subscriptions.map(async item => {
    try {
      if (process.env.NODE_ENV !== 'test') {
        await webpush.sendNotification({
          endpoint: item.endpoint,
          keys: { p256dh: item.p256dh, auth: item.auth },
        }, body, { TTL: 24 * 60 * 60, urgency: 'normal' });
      }
      result.sent += 1;
    } catch (error) {
      const status = Number(error.statusCode || error.status || 0);
      if (status === 404 || status === 410) {
        await removeExpiredSubscription(item.id);
        result.expired += 1;
      } else {
        console.error('No se pudo enviar una notificación push:', error);
      }
      result.failed += 1;
    }
  }));
  return result;
}

export async function sendPushToUsers(userIds, payload) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!configured || !ids.length) return { attempted: 0, sent: 0, failed: 0, expired: 0 };
  const subscriptions = await getDb().execute({
    sql: `SELECT id, endpoint, p256dh, auth FROM push_subscriptions
          WHERE user_id IN (${ids.map(() => '?').join(', ')})`,
    args: ids,
  });
  return deliver(subscriptions.rows, payload);
}

export async function sendPushToGroup(groupId, payload, { excludeUserId } = {}) {
  if (!configured) return { attempted: 0, sent: 0, failed: 0, expired: 0 };
  const args = [groupId];
  const exclusion = excludeUserId ? 'AND ps.user_id <> ?' : '';
  if (excludeUserId) args.push(excludeUserId);
  const subscriptions = await getDb().execute({
    sql: `SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth
          FROM push_subscriptions ps
          JOIN group_members gm ON gm.user_id = ps.user_id
          JOIN users u ON u.id = ps.user_id
          WHERE gm.group_id = ? AND u.deleted_at IS NULL ${exclusion}`,
    args,
  });
  return deliver(subscriptions.rows, payload);
}
