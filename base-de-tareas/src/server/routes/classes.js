import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { logActivity } from '../activity.js';
import { getDb } from '../db.js';
import { notFound } from '../errors.js';
import { asyncRoute } from '../middleware.js';
import { requireMembership } from '../permissions.js';
import { idSchema, parse } from '../validation.js';

const router = Router({ mergeParams: true });
router.use(asyncRoute(requireUser));

const classSchema = z.object({
  name: z.string().trim().min(1).max(100),
  code: z.string().trim().max(40).default(''),
  teacher: z.string().trim().max(100).default(''),
  schedule: z.string().trim().max(160).default(''),
  room: z.string().trim().max(80).default(''),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default('#6366f1'),
  icon: z.string().trim().min(1).max(40).default('book-open'),
  semester_id: z.union([idSchema, z.null()]).optional(),
  topics: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
});

async function classInGroup(groupId, classId, includeDeleted = false) {
  const result = await getDb().execute({
    sql: `SELECT * FROM classes WHERE id = ? AND group_id = ? ${includeDeleted ? '' : 'AND deleted_at IS NULL'}`,
    args: [classId, groupId],
  });
  if (!result.rows[0]) throw notFound('Materia no encontrada.');
  return result.rows[0];
}

router.get('/', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  await requireMembership(groupId, req.user.id);
  const result = await getDb().execute({
    sql: `SELECT c.*,
            (SELECT COUNT(*) FROM tasks t WHERE t.class_id = c.id AND t.deleted_at IS NULL) AS task_count,
            (SELECT COUNT(*) FROM tasks t JOIN task_completions tc ON tc.task_id = t.id
             WHERE t.class_id = c.id AND t.deleted_at IS NULL AND tc.user_id = ?) AS completed_count
          FROM classes c WHERE c.group_id = ? AND c.deleted_at IS NULL
          ORDER BY c.name COLLATE NOCASE`,
    args: [req.user.id, groupId],
  });
  const topics = await getDb().execute({
    sql: `SELECT ct.* FROM class_topics ct JOIN classes c ON c.id = ct.class_id
          WHERE c.group_id = ? AND c.deleted_at IS NULL ORDER BY ct.class_id, ct.position`,
    args: [groupId],
  });
  const byClass = new Map();
  for (const topic of topics.rows) {
    if (!byClass.has(topic.class_id)) byClass.set(topic.class_id, []);
    byClass.get(topic.class_id).push(topic);
  }
  res.json({ classes: result.rows.map(item => ({ ...item, topics: byClass.get(item.id) || [] })) });
}));

router.post('/', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  await requireMembership(groupId, req.user.id, 'manager');
  const input = parse(classSchema, req.body);
  if (input.semester_id) {
    const semester = await getDb().execute({ sql: 'SELECT 1 FROM semesters WHERE id = ? AND group_id = ?', args: [input.semester_id, groupId] });
    if (!semester.rows.length) throw notFound('Semestre no encontrado.');
  }
  const classId = randomUUID();
  const statements = [{
    sql: `INSERT INTO classes
          (id, group_id, semester_id, name, code, teacher, schedule, room, color, icon, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [classId, groupId, input.semester_id || null, input.name, input.code, input.teacher, input.schedule, input.room, input.color, input.icon, req.user.id],
  }];
  for (const [position, name] of [...new Set(input.topics)].entries()) {
    statements.push({ sql: 'INSERT INTO class_topics (id, class_id, name, position) VALUES (?, ?, ?, ?)', args: [randomUUID(), classId, name, position] });
  }
  await getDb().batch(statements, 'write');
  await logActivity({ groupId, userId: req.user.id, action: 'class.created', entityType: 'class', entityId: classId, summary: `Creó la materia ${input.name}.` });
  res.status(201).json({ class: { id: classId, group_id: groupId, ...input } });
}));

router.patch('/:classId', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  const classId = parse(idSchema, req.params.classId);
  await requireMembership(groupId, req.user.id, 'manager');
  await classInGroup(groupId, classId);
  const input = parse(classSchema, req.body);
  const statements = [
    { sql: `UPDATE classes SET semester_id = ?, name = ?, code = ?, teacher = ?, schedule = ?, room = ?,
            color = ?, icon = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, args: [input.semester_id || null, input.name, input.code, input.teacher, input.schedule, input.room, input.color, input.icon, classId] },
    { sql: 'DELETE FROM class_topics WHERE class_id = ?', args: [classId] },
  ];
  for (const [position, name] of [...new Set(input.topics)].entries()) {
    statements.push({ sql: 'INSERT INTO class_topics (id, class_id, name, position) VALUES (?, ?, ?, ?)', args: [randomUUID(), classId, name, position] });
  }
  await getDb().batch(statements, 'write');
  await logActivity({ groupId, userId: req.user.id, action: 'class.updated', entityType: 'class', entityId: classId, summary: `Actualizó la materia ${input.name}.` });
  res.json({ class: { id: classId, group_id: groupId, ...input } });
}));

router.delete('/:classId', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  const classId = parse(idSchema, req.params.classId);
  await requireMembership(groupId, req.user.id, 'manager');
  const item = await classInGroup(groupId, classId);
  await getDb().batch([
    { sql: 'UPDATE classes SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', args: [classId] },
    { sql: 'UPDATE tasks SET deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP) WHERE class_id = ?', args: [classId] },
  ], 'write');
  await logActivity({ groupId, userId: req.user.id, action: 'class.deleted', entityType: 'class', entityId: classId, summary: `Movió ${item.name} a la papelera.` });
  res.status(204).end();
}));

router.post('/:classId/restore', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  const classId = parse(idSchema, req.params.classId);
  await requireMembership(groupId, req.user.id, 'manager');
  await classInGroup(groupId, classId, true);
  await getDb().execute({ sql: 'UPDATE classes SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?', args: [classId] });
  res.json({ restored: true });
}));

export default router;
