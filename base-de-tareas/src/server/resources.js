import { getDb } from './db.js';
import { notFound } from './errors.js';

export async function taskInGroup(groupId, taskId, includeDeleted = false) {
  const result = await getDb().execute({
    sql: `SELECT t.*, c.name AS class_name, c.color AS class_color
          FROM tasks t JOIN classes c ON c.id = t.class_id
          WHERE t.id = ? AND t.group_id = ? ${includeDeleted ? '' : 'AND t.deleted_at IS NULL'}`,
    args: [taskId, groupId],
  });
  if (!result.rows[0]) throw notFound('Tarea no encontrada.');
  return result.rows[0];
}
