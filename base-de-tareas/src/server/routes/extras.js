import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { getDb } from '../db.js';
import { asyncRoute } from '../middleware.js';
import { requireMembership } from '../permissions.js';
import { idSchema, parse } from '../validation.js';

const router = Router({ mergeParams: true });
router.use(asyncRoute(requireUser));

router.get('/activity', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  await requireMembership(groupId, req.user.id);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
  const result = await getDb().execute({
    sql: `SELECT a.id, a.action, a.entity_type, a.entity_id, a.summary, a.metadata_json,
                 a.created_at, u.name AS user_name, u.avatar_url
          FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
          WHERE a.group_id = ? ORDER BY a.created_at DESC LIMIT ?`,
    args: [groupId, limit],
  });
  res.json({ activity: result.rows.map(row => ({ ...row, metadata: JSON.parse(row.metadata_json || '{}'), metadata_json: undefined })) });
}));

router.get('/semesters', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  await requireMembership(groupId, req.user.id);
  const result = await getDb().execute({ sql: 'SELECT * FROM semesters WHERE group_id = ? ORDER BY is_active DESC, created_at DESC', args: [groupId] });
  res.json({ semesters: result.rows });
}));

router.post('/semesters', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  await requireMembership(groupId, req.user.id, 'admin');
  const input = parse(z.object({ name: z.string().trim().min(2).max(80), starts_on: z.string().date().nullable().optional(), ends_on: z.string().date().nullable().optional() }), req.body);
  const semester = { id: randomUUID(), ...input };
  await getDb().execute({ sql: 'INSERT INTO semesters (id, group_id, name, starts_on, ends_on) VALUES (?, ?, ?, ?, ?)', args: [semester.id, groupId, input.name, input.starts_on || null, input.ends_on || null] });
  res.status(201).json({ semester });
}));

router.patch('/semesters/:semesterId/archive', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  const semesterId = parse(idSchema, req.params.semesterId);
  await requireMembership(groupId, req.user.id, 'admin');
  await getDb().execute({ sql: 'UPDATE semesters SET is_active = 0, archived_at = CURRENT_TIMESTAMP WHERE id = ? AND group_id = ?', args: [semesterId, groupId] });
  res.json({ archived: true });
}));

router.get('/trash', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  await requireMembership(groupId, req.user.id, 'manager');
  const [tasks, classes] = await Promise.all([
    getDb().execute({ sql: `SELECT t.id, t.title AS name, t.deleted_at, 'task' AS type, c.name AS context
                                  FROM tasks t JOIN classes c ON c.id = t.class_id WHERE t.group_id = ? AND t.deleted_at IS NOT NULL ORDER BY t.deleted_at DESC`, args: [groupId] }),
    getDb().execute({ sql: `SELECT id, name, deleted_at, 'class' AS type, '' AS context
                                  FROM classes WHERE group_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC`, args: [groupId] }),
  ]);
  res.json({ items: [...tasks.rows, ...classes.rows].sort((a, b) => String(b.deleted_at).localeCompare(String(a.deleted_at))) });
}));

router.get('/export', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  await requireMembership(groupId, req.user.id);
  const result = await getDb().execute({
    sql: `SELECT t.id, t.title, t.description, t.due_at, t.is_important, c.name AS class_name,
                 ct.name AS topic_name, CASE WHEN tc.task_id IS NULL THEN 0 ELSE 1 END AS completed
          FROM tasks t JOIN classes c ON c.id = t.class_id
          LEFT JOIN class_topics ct ON ct.id = t.topic_id
          LEFT JOIN task_completions tc ON tc.task_id = t.id AND tc.user_id = ?
          WHERE t.group_id = ? AND t.deleted_at IS NULL ORDER BY t.due_at`,
    args: [req.user.id, groupId],
  });
  const format = String(req.query.format || 'json');
  if (format === 'csv') {
    const cell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const rows = [['Materia', 'Tema', 'Tarea', 'Descripción', 'Entrega', 'Importante', 'Completada'], ...result.rows.map(task => [task.class_name, task.topic_name, task.title, task.description, task.due_at, task.is_important, task.completed])];
    res.type('text/csv').set('Content-Disposition', 'attachment; filename="tareas.csv"').send(`\uFEFF${rows.map(row => row.map(cell).join(',')).join('\n')}`);
    return;
  }
  if (format === 'ics') {
    const clean = value => String(value || '').replaceAll('\\', '\\\\').replaceAll(',', '\\,').replaceAll(';', '\\;').replaceAll('\n', '\\n');
    const date = value => new Date(value).toISOString().replace(/[-:]/g, '').replace('.000', '');
    const events = result.rows.map(task => `BEGIN:VEVENT\nUID:${task.id}@basedetareas\nDTSTAMP:${date(new Date())}\nDTSTART:${date(task.due_at)}\nSUMMARY:${clean(task.title)}\nDESCRIPTION:${clean(`${task.class_name}\\n${task.description}`)}\nEND:VEVENT`).join('\n');
    res.type('text/calendar').set('Content-Disposition', 'attachment; filename="tareas.ics"').send(`BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Base de Tareas//ES\n${events}\nEND:VCALENDAR`);
    return;
  }
  res.json({ tasks: result.rows, exported_at: new Date().toISOString() });
}));

export default router;
