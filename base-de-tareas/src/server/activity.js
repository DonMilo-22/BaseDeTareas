import { randomUUID } from 'node:crypto';
import { getDb } from './db.js';

export async function logActivity({ groupId, userId, action, entityType, entityId, summary, metadata = {} }) {
  await getDb().execute({
    sql: `INSERT INTO activity_logs
          (id, group_id, user_id, action, entity_type, entity_id, summary, metadata_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [randomUUID(), groupId, userId || null, action, entityType, entityId || null, summary, JSON.stringify(metadata)],
  });
}
