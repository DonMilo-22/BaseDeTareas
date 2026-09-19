import { Router } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getDb } from '../db.js';
import { requireUser } from '../auth.js';
import { logActivity } from '../activity.js';
import { AppError, forbidden, notFound } from '../errors.js';
import { asyncRoute } from '../middleware.js';
import { requireMembership } from '../permissions.js';
import { idSchema, nameSchema, parse } from '../validation.js';

const router = Router();
router.use(asyncRoute(requireUser));

const groupSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).default(''),
  semester_name: z.string().trim().min(2).max(80).default('Semestre actual'),
});

function joinCode() {
  return randomBytes(4).toString('hex').toUpperCase();
}

router.get('/', asyncRoute(async (req, res) => {
  const result = await getDb().execute({
    sql: `SELECT g.id, g.name, g.description, g.join_code, g.archived_at, gm.role,
                 (SELECT COUNT(*) FROM group_members x WHERE x.group_id = g.id) AS member_count
          FROM group_members gm JOIN groups g ON g.id = gm.group_id
          WHERE gm.user_id = ? ORDER BY g.archived_at IS NOT NULL, g.updated_at DESC`,
    args: [req.user.id],
  });
  res.json({ groups: result.rows });
}));

router.post('/', asyncRoute(async (req, res) => {
  const input = parse(groupSchema, req.body);
  const groupId = randomUUID();
  const semesterId = randomUUID();
  let code = joinCode();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const exists = await getDb().execute({ sql: 'SELECT 1 FROM groups WHERE join_code = ?', args: [code] });
    if (!exists.rows.length) break;
    code = joinCode();
  }
  await getDb().batch([
    { sql: `INSERT INTO groups (id, name, description, join_code, created_by) VALUES (?, ?, ?, ?, ?)`, args: [groupId, input.name, input.description, code, req.user.id] },
    { sql: `INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'admin')`, args: [groupId, req.user.id] },
    { sql: `INSERT INTO semesters (id, group_id, name) VALUES (?, ?, ?)`, args: [semesterId, groupId, input.semester_name] },
  ], 'write');
  await logActivity({ groupId, userId: req.user.id, action: 'group.created', entityType: 'group', entityId: groupId, summary: `Creó el grupo ${input.name}.` });
  res.status(201).json({ group: { id: groupId, name: input.name, description: input.description, join_code: code, role: 'admin' } });
}));

router.post('/join', asyncRoute(async (req, res) => {
  const { code } = parse(z.object({ code: z.string().trim().min(6).max(20).transform(v => v.toUpperCase()) }), req.body);
  const groupResult = await getDb().execute({ sql: 'SELECT id, name, archived_at FROM groups WHERE join_code = ? COLLATE NOCASE', args: [code] });
  const group = groupResult.rows[0];
  if (!group || group.archived_at) throw notFound('El código de invitación no es válido.');
  const existing = await getDb().execute({ sql: 'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?', args: [group.id, req.user.id] });
  if (existing.rows.length) throw new AppError(409, 'Ya perteneces a este grupo.', 'ALREADY_MEMBER');
  await getDb().execute({ sql: `INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')`, args: [group.id, req.user.id] });
  await logActivity({ groupId: group.id, userId: req.user.id, action: 'member.joined', entityType: 'user', entityId: req.user.id, summary: `${req.user.name} se unió al grupo.` });
  res.status(201).json({ group: { ...group, role: 'member' } });
}));

router.get('/:groupId', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  const membership = await requireMembership(groupId, req.user.id);
  const result = await getDb().execute({
    sql: `SELECT id, name, description, join_code, created_at, updated_at, archived_at
          FROM groups WHERE id = ?`,
    args: [groupId],
  });
  res.json({ group: { ...result.rows[0], role: membership.role } });
}));

router.patch('/:groupId', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  await requireMembership(groupId, req.user.id, 'admin');
  const input = parse(z.object({ name: z.string().trim().min(2).max(100), description: z.string().trim().max(500).default('') }), req.body);
  await getDb().execute({ sql: 'UPDATE groups SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', args: [input.name, input.description, groupId] });
  res.json({ group: { id: groupId, ...input } });
}));

router.get('/:groupId/members', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  const membership = await requireMembership(groupId, req.user.id);
  const result = await getDb().execute({
    sql: `SELECT u.id, u.name, u.avatar_url, gm.role, gm.joined_at,
                 (SELECT COUNT(*) FROM task_completions tc
                  JOIN tasks t ON t.id = tc.task_id
                  WHERE tc.user_id = u.id AND t.group_id = ? AND t.deleted_at IS NULL) AS completed_tasks
          FROM group_members gm JOIN users u ON u.id = gm.user_id
          WHERE gm.group_id = ? AND u.deleted_at IS NULL
          ORDER BY CASE gm.role WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END, u.name`,
    args: [groupId, groupId],
  });
  res.json({ members: result.rows, current_role: membership.role });
}));

router.patch('/:groupId/members/:userId', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  const userId = parse(idSchema, req.params.userId);
  await requireMembership(groupId, req.user.id, 'admin');
  const { role } = parse(z.object({ role: z.enum(['admin', 'manager', 'member']) }), req.body);
  const target = await requireMembership(groupId, userId);
  if (target.role === 'admin' && role !== 'admin') {
    const admins = await getDb().execute({ sql: `SELECT COUNT(*) AS count FROM group_members WHERE group_id = ? AND role = 'admin'`, args: [groupId] });
    if (Number(admins.rows[0].count) <= 1) throw new AppError(409, 'El grupo debe conservar al menos un administrador.', 'LAST_ADMIN');
  }
  await getDb().execute({ sql: 'UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?', args: [role, groupId, userId] });
  await logActivity({ groupId, userId: req.user.id, action: 'member.role_changed', entityType: 'user', entityId: userId, summary: `Actualizó un rol a ${role}.` });
  res.json({ member: { user_id: userId, role } });
}));

router.delete('/:groupId/members/:userId', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  const userId = parse(idSchema, req.params.userId);
  const actor = await requireMembership(groupId, req.user.id);
  if (userId !== req.user.id && actor.role !== 'admin') throw forbidden();
  const target = await requireMembership(groupId, userId);
  if (target.role === 'admin') {
    const admins = await getDb().execute({ sql: `SELECT COUNT(*) AS count FROM group_members WHERE group_id = ? AND role = 'admin'`, args: [groupId] });
    if (Number(admins.rows[0].count) <= 1) throw new AppError(409, 'Transfiere la administración antes de salir.', 'LAST_ADMIN');
  }
  await getDb().execute({ sql: 'DELETE FROM group_members WHERE group_id = ? AND user_id = ?', args: [groupId, userId] });
  res.status(204).end();
}));

router.get('/:groupId/dashboard', asyncRoute(async (req, res) => {
  const groupId = parse(idSchema, req.params.groupId);
  const membership = await requireMembership(groupId, req.user.id);
  const now = new Date().toISOString();
  const week = new Date(Date.now() + 7 * 86400000).toISOString();
  const [summary, upcoming, activity] = await Promise.all([
    getDb().execute({
      sql: `SELECT
              COUNT(*) AS total,
              SUM(CASE WHEN t.due_at < ? AND tc.task_id IS NULL THEN 1 ELSE 0 END) AS overdue,
              SUM(CASE WHEN t.due_at >= ? AND t.due_at <= ? AND tc.task_id IS NULL THEN 1 ELSE 0 END) AS next_seven_days,
              SUM(CASE WHEN tc.task_id IS NOT NULL THEN 1 ELSE 0 END) AS completed
            FROM tasks t LEFT JOIN task_completions tc ON tc.task_id = t.id AND tc.user_id = ?
            WHERE t.group_id = ? AND t.deleted_at IS NULL`,
      args: [now, now, week, req.user.id, groupId],
    }),
    getDb().execute({
      sql: `SELECT t.id, t.title, t.due_at, t.is_important, c.name AS class_name, c.color,
                   CASE WHEN tc.task_id IS NULL THEN 0 ELSE 1 END AS completed
            FROM tasks t JOIN classes c ON c.id = t.class_id
            LEFT JOIN task_completions tc ON tc.task_id = t.id AND tc.user_id = ?
            WHERE t.group_id = ? AND t.deleted_at IS NULL AND t.due_at <= ?
            ORDER BY completed, t.due_at LIMIT 12`,
      args: [req.user.id, groupId, week],
    }),
    getDb().execute({
      sql: `SELECT a.id, a.action, a.summary, a.created_at, u.name AS user_name, u.avatar_url
            FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
            WHERE a.group_id = ? ORDER BY a.created_at DESC LIMIT 8`,
      args: [groupId],
    }),
  ]);
  res.json({ summary: summary.rows[0], upcoming: upcoming.rows, activity: activity.rows, role: membership.role });
}));

export default router;
