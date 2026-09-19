import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { logActivity } from '../activity.js';
import { getDb } from '../db.js';
import { forbidden, notFound } from '../errors.js';
import { asyncRoute } from '../middleware.js';
import { requireMembership } from '../permissions.js';
import { taskInGroup } from '../resources.js';
import { idSchema, parse } from '../validation.js';

const router = Router({ mergeParams: true });
router.use(asyncRoute(requireUser));

async function context(req, minimumRole = 'member') {
  const groupId = parse(idSchema, req.params.groupId);
  const taskId = parse(idSchema, req.params.taskId);
  const membership = await requireMembership(groupId, req.user.id, minimumRole);
  const task = await taskInGroup(groupId, taskId);
  return { groupId, taskId, membership, task };
}

router.post('/:taskId/subtasks', asyncRoute(async (req, res) => {
  const { groupId, taskId } = await context(req, 'manager');
  const { title } = parse(z.object({ title: z.string().trim().min(1).max(160) }), req.body);
  const positionResult = await getDb().execute({ sql: 'SELECT COALESCE(MAX(position), -1) + 1 AS position FROM subtasks WHERE task_id = ?', args: [taskId] });
  const subtask = { id: randomUUID(), title, position: Number(positionResult.rows[0].position) };
  await getDb().execute({ sql: 'INSERT INTO subtasks (id, task_id, title, position, created_by) VALUES (?, ?, ?, ?, ?)', args: [subtask.id, taskId, title, subtask.position, req.user.id] });
  await logActivity({ groupId, userId: req.user.id, action: 'subtask.created', entityType: 'task', entityId: taskId, summary: `Añadió un paso a la tarea.` });
  res.status(201).json({ subtask });
}));

router.patch('/:taskId/subtasks/:subtaskId', asyncRoute(async (req, res) => {
  const { taskId } = await context(req, 'manager');
  const subtaskId = parse(idSchema, req.params.subtaskId);
  const { title, position } = parse(z.object({ title: z.string().trim().min(1).max(160), position: z.number().int().min(0).max(999) }), req.body);
  const result = await getDb().execute({ sql: 'UPDATE subtasks SET title = ?, position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND task_id = ?', args: [title, position, subtaskId, taskId] });
  if (!result.rowsAffected) throw notFound('Paso no encontrado.');
  res.json({ subtask: { id: subtaskId, title, position } });
}));

router.delete('/:taskId/subtasks/:subtaskId', asyncRoute(async (req, res) => {
  const { taskId } = await context(req, 'manager');
  const subtaskId = parse(idSchema, req.params.subtaskId);
  await getDb().execute({ sql: 'DELETE FROM subtasks WHERE id = ? AND task_id = ?', args: [subtaskId, taskId] });
  res.status(204).end();
}));

router.put('/:taskId/subtasks/:subtaskId/completion', asyncRoute(async (req, res) => {
  const { taskId } = await context(req);
  const subtaskId = parse(idSchema, req.params.subtaskId);
  const { completed } = parse(z.object({ completed: z.boolean() }), req.body);
  const exists = await getDb().execute({ sql: 'SELECT 1 FROM subtasks WHERE id = ? AND task_id = ?', args: [subtaskId, taskId] });
  if (!exists.rows.length) throw notFound('Paso no encontrado.');
  if (completed) {
    await getDb().execute({ sql: `INSERT INTO subtask_completions (subtask_id, user_id) VALUES (?, ?)
                                         ON CONFLICT(subtask_id, user_id) DO UPDATE SET completed_at = CURRENT_TIMESTAMP`, args: [subtaskId, req.user.id] });
  } else {
    await getDb().execute({ sql: 'DELETE FROM subtask_completions WHERE subtask_id = ? AND user_id = ?', args: [subtaskId, req.user.id] });
  }
  res.json({ completed });
}));

router.post('/:taskId/comments', asyncRoute(async (req, res) => {
  const { groupId, taskId, task } = await context(req);
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(2000) }), req.body);
  const comment = { id: randomUUID(), body, user_id: req.user.id, user_name: req.user.name, avatar_url: req.user.avatar_url, created_at: new Date().toISOString() };
  await getDb().execute({ sql: 'INSERT INTO task_comments (id, task_id, user_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', args: [comment.id, taskId, req.user.id, body, comment.created_at, comment.created_at] });
  await logActivity({ groupId, userId: req.user.id, action: 'comment.created', entityType: 'task', entityId: taskId, summary: `Comentó en ${task.title}.` });
  res.status(201).json({ comment });
}));

router.patch('/:taskId/comments/:commentId', asyncRoute(async (req, res) => {
  const { taskId } = await context(req);
  const commentId = parse(idSchema, req.params.commentId);
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(2000) }), req.body);
  const commentResult = await getDb().execute({ sql: 'SELECT user_id FROM task_comments WHERE id = ? AND task_id = ? AND deleted_at IS NULL', args: [commentId, taskId] });
  if (!commentResult.rows.length) throw notFound('Comentario no encontrado.');
  if (commentResult.rows[0].user_id !== req.user.id) throw forbidden('Solo puedes editar tus comentarios.');
  await getDb().execute({ sql: 'UPDATE task_comments SET body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', args: [body, commentId] });
  res.json({ comment: { id: commentId, body } });
}));

router.delete('/:taskId/comments/:commentId', asyncRoute(async (req, res) => {
  const { taskId, membership } = await context(req);
  const commentId = parse(idSchema, req.params.commentId);
  const commentResult = await getDb().execute({ sql: 'SELECT user_id FROM task_comments WHERE id = ? AND task_id = ? AND deleted_at IS NULL', args: [commentId, taskId] });
  if (!commentResult.rows.length) throw notFound('Comentario no encontrado.');
  if (commentResult.rows[0].user_id !== req.user.id && membership.role === 'member') throw forbidden();
  await getDb().execute({ sql: 'UPDATE task_comments SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', args: [commentId] });
  res.status(204).end();
}));

router.post('/:taskId/attachments', asyncRoute(async (req, res) => {
  const { taskId } = await context(req, 'manager');
  const input = parse(z.object({
    name: z.string().trim().min(1).max(180),
    url: z.string().url().max(2048),
    mime_type: z.string().trim().max(120).default(''),
    size_bytes: z.number().int().nonnegative().max(25_000_000).nullable().optional(),
  }), req.body);
  const attachment = { id: randomUUID(), ...input };
  await getDb().execute({ sql: `INSERT INTO task_attachments (id, task_id, uploaded_by, name, url, mime_type, size_bytes)
                                       VALUES (?, ?, ?, ?, ?, ?, ?)`, args: [attachment.id, taskId, req.user.id, input.name, input.url, input.mime_type, input.size_bytes || null] });
  res.status(201).json({ attachment });
}));

router.delete('/:taskId/attachments/:attachmentId', asyncRoute(async (req, res) => {
  const { taskId } = await context(req, 'manager');
  const attachmentId = parse(idSchema, req.params.attachmentId);
  await getDb().execute({ sql: 'DELETE FROM task_attachments WHERE id = ? AND task_id = ?', args: [attachmentId, taskId] });
  res.status(204).end();
}));

export default router;
