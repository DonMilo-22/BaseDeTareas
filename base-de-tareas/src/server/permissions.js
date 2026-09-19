import { getDb } from './db.js';
import { forbidden, notFound } from './errors.js';

const rank = { member: 1, manager: 2, admin: 3 };

export async function getMembership(groupId, userId) {
  const result = await getDb().execute({
    sql: `SELECT gm.group_id, gm.user_id, gm.role, g.name AS group_name, g.archived_at
          FROM group_members gm JOIN groups g ON g.id = gm.group_id
          WHERE gm.group_id = ? AND gm.user_id = ?`,
    args: [groupId, userId],
  });
  return result.rows[0] || null;
}

export async function requireMembership(groupId, userId, minimumRole = 'member') {
  const membership = await getMembership(groupId, userId);
  if (!membership) throw notFound('No perteneces a este grupo.');
  if ((rank[membership.role] || 0) < rank[minimumRole]) throw forbidden();
  return membership;
}

export function canManage(role) {
  return role === 'admin' || role === 'manager';
}
