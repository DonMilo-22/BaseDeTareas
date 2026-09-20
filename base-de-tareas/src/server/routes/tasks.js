import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { logActivity } from '../activity.js';
import { getDb } from '../db.js';
import { sendTaskCreatedNotifications } from '../email.js';
import { notFound } from '../errors.js';
import { asyncRoute } from '../middleware.js';
import { requireMembership } from '../permissions.js';
import { taskInGroup } from '../resources.js';
import { cancelTaskReminders } from '../reminder-cleanup.js';
import { sendPushToGroup } from '../push.js';
import { booleanFromQuery, idSchema, isoDateSchema, parse } from '../validation.js';

const router = Router({ mergeParams: true });
router.use(asyncRoute(requireUser));

const taskSchema = z.object({
  class_id: idSchema,
  topic_id: z.union([idSchema, z.null()]).optional(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(10000).default(''),
  due_at: isoDateSchema,
  is_important: z.boolean().default(false),
  subtasks: z.array(z.string().trim().min(1).max(160)).max(50).default([]),
});

async function validateRelations(groupId, input) {
  const classResult = await getDb().execute({ sql: 'SELECT id FROM classes WHERE id = ? AND group_id = ? AND deleted_at IS NULL', args: [input.class_id, groupId] });
  if (!classResult.rows.length) throw notFound('Materia no encontrada.');
  if (input.topic_id) {
    const topic = await getDb().execute({ sql: 'SELECT id FROM class_topics WHERE id = ? AND class_id = ?', args: [input.topic_id, input.class_id] });
    if (!topic.rows.length) throw notFound('Tema no encontrado.');
  }
}

router.get('/', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  await requireMembership(groupId, req.user.id);
  const clauses = ['t.group_id = ?', 't.deleted_at IS NULL'];
  const args = [req.user.id, groupId];
  if (req.query.class_id) { clauses.push('t.class_id = ?'); args.push(parse(idSchema, req.query.class_id)); }
  if (req.query.topic_id) { clauses.push('t.topic_id = ?'); args.push(parse(idSchema, req.query.topic_id)); }
  if (req.query.search) { clauses.push('(LOWER(t.title) LIKE ? OR LOWER(t.description) LIKE ?)'); const term = `%${String(req.query.search).trim().toLowerCase().slice(0, 100)}%`; args.push(term, term); }
  if (req.query.from) { clauses.push('t.due_at >= ?'); args.push(String(req.query.from)); }
  if (req.query.to) { clauses.push('t.due_at <= ?'); args.push(String(req.query.to)); }
  if (req.query.important !== undefined) { clauses.push('t.is_important = ?'); args.push(Number(booleanFromQuery(req.query.important))); }
  if (req.query.status === 'completed') clauses.push('tc.task_id IS NOT NULL');
  if (req.query.status === 'pending') clauses.push('tc.task_id IS NULL');
  const result = await getDb().execute({
    sql: `SELECT t.id, t.group_id, t.class_id, t.topic_id, t.title, t.description, t.due_at,
                 t.is_important, t.created_by, t.updated_at, t.version,
                 c.name AS class_name, c.color AS class_color, c.icon AS class_icon,
                 ct.name AS topic_name, CASE WHEN tc.task_id IS NULL THEN 0 ELSE 1 END AS completed,
                 (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id) AS subtask_count,
                 (SELECT COUNT(*) FROM subtasks s JOIN subtask_completions sc ON sc.subtask_id = s.id
                  WHERE s.task_id = t.id AND sc.user_id = ?) AS completed_subtasks,
                 (SELECT COUNT(*) FROM task_comments cm WHERE cm.task_id = t.id AND cm.deleted_at IS NULL) AS comment_count
          FROM tasks t JOIN classes c ON c.id = t.class_id
          LEFT JOIN class_topics ct ON ct.id = t.topic_id
          LEFT JOIN task_completions tc ON tc.task_id = t.id AND tc.user_id = ?
          WHERE ${clauses.join(' AND ')} ORDER BY tc.task_id IS NOT NULL, t.due_at, t.is_important DESC LIMIT 500`,
    args: [req.user.id, ...args],
  });
  res.json({ tasks: result.rows });
}));

router.post('/', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  await requireMembership(groupId, req.user.id, 'manager');
  const input = parse(taskSchema, req.body);
  await validateRelations(groupId, input);
  const taskId = randomUUID();
  const statements = [{
    sql: `INSERT INTO tasks
          (id, group_id, class_id, topic_id, title, description, due_at, is_important, created_by, updated_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [taskId, groupId, input.class_id, input.topic_id || null, input.title, input.description, input.due_at, Number(input.is_important), req.user.id, req.user.id],
  }];
  for (const [position, title] of input.subtasks.entries()) statements.push({ sql: 'INSERT INTO subtasks (id, task_id, title, position, created_by) VALUES (?, ?, ?, ?, ?)', args: [randomUUID(), taskId, title, position, req.user.id] });
  await getDb().batch(statements, 'write');
  await logActivity({ groupId, userId: req.user.id, action: 'task.created', entityType: 'task', entityId: taskId, summary: `Creó la tarea ${input.title}.` });
  let emailNotification = { attempted: 0, sent: 0, failed: 0 };
  try {
    const recipients = await getDb().execute({
      sql: `SELECT u.id, u.name, u.email
            FROM group_members gm JOIN users u ON u.id = gm.user_id
            WHERE gm.group_id = ? AND u.deleted_at IS NULL AND u.email_notifications = 1`,
      args: [groupId],
    });
    const classResult = await getDb().execute({
      sql: 'SELECT name FROM classes WHERE id = ? AND group_id = ?',
      args: [input.class_id, groupId],
    });
    const notification = await sendTaskCreatedNotifications({
      task: { id: taskId, group_id: groupId, ...input, class_name: classResult.rows[0]?.name || 'Materia' },
      recipients: recipients.rows,
      creatorName: req.user.name,
    });
    emailNotification = {
      attempted: notification.attempted,
      sent: notification.sent,
      failed: notification.failed,
    };
  } catch (error) {
    console.error('La tarea se creó, pero el aviso por correo falló:', error);
    emailNotification.failed += 1;
  }
  let pushNotification = { attempted: 0, sent: 0, failed: 0, expired: 0 };
  try {
    const classResult = await getDb().execute({
      sql: 'SELECT name FROM classes WHERE id = ? AND group_id = ?',
      args: [input.class_id, groupId],
    });
    pushNotification = await sendPushToGroup(groupId, {
      title: 'Nueva tarea',
      body: `${classResult.rows[0]?.name || 'Materia'} · ${input.title}`,
      url: `/?group=${encodeURIComponent(groupId)}&task=${encodeURIComponent(taskId)}#tasks`,
      tag: `task-${taskId}`,
    }, { excludeUserId: req.user.id });
  } catch (error) {
    console.error('La tarea se creó, pero el aviso push falló:', error);
    pushNotification.failed += 1;
  }
  res.status(201).json({ task: { id: taskId, group_id: groupId, ...input }, email_notification: emailNotification, push_notification: pushNotification });
}));

router.get('/:taskId', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  const taskId = parse(idSchema, req.params.taskId);
  const membership = await requireMembership(groupId, req.user.id);
  const task = await taskInGroup(groupId, taskId);
  const [subtasks, comments, attachments, reminders, completion, memberProgress] = await Promise.all([
    getDb().execute({ sql: `SELECT s.*, CASE WHEN sc.subtask_id IS NULL THEN 0 ELSE 1 END AS completed
                                  FROM subtasks s LEFT JOIN subtask_completions sc ON sc.subtask_id = s.id AND sc.user_id = ?
                                  WHERE s.task_id = ? ORDER BY s.position`, args: [req.user.id, taskId] }),
    getDb().execute({ sql: `SELECT cm.id, cm.body, cm.created_at, cm.updated_at, u.id AS user_id, u.name AS user_name, u.avatar_url
                                  FROM task_comments cm JOIN users u ON u.id = cm.user_id
                                  WHERE cm.task_id = ? AND cm.deleted_at IS NULL ORDER BY cm.created_at`, args: [taskId] }),
    getDb().execute({ sql: 'SELECT id, name, url, mime_type, size_bytes, created_at FROM task_attachments WHERE task_id = ? ORDER BY created_at', args: [taskId] }),
    getDb().execute({ sql: `SELECT id, remind_at, channel, status, sent_at FROM reminders
                                  WHERE task_id = ? AND user_id = ? AND status <> 'cancelled' ORDER BY remind_at`, args: [taskId, req.user.id] }),
    getDb().execute({ sql: 'SELECT completed_at FROM task_completions WHERE task_id = ? AND user_id = ?', args: [taskId, req.user.id] }),
    ['admin', 'manager'].includes(membership.role)
      ? getDb().execute({ sql: `SELECT u.id, u.name, u.avatar_url, tc.completed_at
                                      FROM group_members gm JOIN users u ON u.id = gm.user_id
                                      LEFT JOIN task_completions tc ON tc.user_id = u.id AND tc.task_id = ?
                                      WHERE gm.group_id = ? ORDER BY tc.completed_at IS NULL, u.name`, args: [taskId, groupId] })
      : Promise.resolve({ rows: [] }),
  ]);
  res.json({ task: { ...task, completed: completion.rows.length ? 1 : 0 }, subtasks: subtasks.rows, comments: comments.rows, attachments: attachments.rows, reminders: reminders.rows, member_progress: memberProgress.rows });
}));

router.patch('/:taskId', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  const taskId = parse(idSchema, req.params.taskId);
  await requireMembership(groupId, req.user.id, 'manager');
  const current = await taskInGroup(groupId, taskId);
  const input = parse(taskSchema, req.body);
  await validateRelations(groupId, input);
  const statements = [
    {
      sql: `UPDATE tasks SET class_id = ?, topic_id = ?, title = ?, description = ?, due_at = ?,
            is_important = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1 WHERE id = ?`,
      args: [input.class_id, input.topic_id || null, input.title, input.description, input.due_at, Number(input.is_important), req.user.id, taskId],
    },
    { sql: 'DELETE FROM subtasks WHERE task_id = ?', args: [taskId] },
  ];
  for (const [position, title] of input.subtasks.entries()) {
    statements.push({ sql: 'INSERT INTO subtasks (id, task_id, title, position, created_by) VALUES (?, ?, ?, ?, ?)', args: [randomUUID(), taskId, title, position, req.user.id] });
  }
  await getDb().batch(statements, 'write');
  await logActivity({ groupId, userId: req.user.id, action: 'task.updated', entityType: 'task', entityId: taskId, summary: `Actualizó la tarea ${input.title}.`, metadata: { previous_due_at: current.due_at, due_at: input.due_at } });
  res.json({ task: { id: taskId, group_id: groupId, ...input, version: Number(current.version) + 1 } });
}));

router.delete('/:taskId', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  const taskId = parse(idSchema, req.params.taskId);
  await requireMembership(groupId, req.user.id, 'manager');
  const task = await taskInGroup(groupId, taskId);
  await cancelTaskReminders([taskId]);
  await getDb().execute({ sql: `UPDATE tasks SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, args: [taskId] });
  await logActivity({ groupId, userId: req.user.id, action: 'task.deleted', entityType: 'task', entityId: taskId, summary: `Movió ${task.title} a la papelera.` });
  res.status(204).end();
}));

router.post('/:taskId/restore', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  const taskId = parse(idSchema, req.params.taskId);
  await requireMembership(groupId, req.user.id, 'manager');
  await taskInGroup(groupId, taskId, true);
  await getDb().execute({ sql: 'UPDATE tasks SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?', args: [taskId] });
  res.json({ restored: true });
}));

router.put('/:taskId/completion', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  const taskId = parse(idSchema, req.params.taskId);
  await requireMembership(groupId, req.user.id);
  const task = await taskInGroup(groupId, taskId);
  const { completed } = parse(z.object({ completed: z.boolean() }), req.body);
  if (completed) {
    await getDb().execute({ sql: `INSERT INTO task_completions (task_id, user_id) VALUES (?, ?)
                                         ON CONFLICT(task_id, user_id) DO UPDATE SET completed_at = CURRENT_TIMESTAMP`, args: [taskId, req.user.id] });
  } else {
    await getDb().execute({ sql: 'DELETE FROM task_completions WHERE task_id = ? AND user_id = ?', args: [taskId, req.user.id] });
  }
  await logActivity({ groupId, userId: req.user.id, action: completed ? 'task.completed' : 'task.reopened', entityType: 'task', entityId: taskId, summary: `${completed ? 'Completó' : 'Reabrió'} ${task.title}.` });
  res.json({ completed });
}));

export default router;
