import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { getDb } from '../db.js';
import { comparePassword, createSession, clearSession, hashPassword, requireUser } from '../auth.js';
import { issueAuthCode, revokeAuthCode, verifyAuthCode } from '../auth-codes.js';
import { sendAuthenticationCode } from '../email.js';
import { AppError } from '../errors.js';
import { asyncRoute } from '../middleware.js';
import { emailSchema, httpUrlSchema, nameSchema, parse, passwordSchema } from '../validation.js';

const router = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Demasiados intentos. Espera unos minutos.' } },
});

const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  timezone: z.string().trim().min(1).max(80).default('America/Mexico_City'),
});
const codeSchema = z.string().trim().regex(/^\d{6}$/);
const emailOnlySchema = z.object({ email: emailSchema });
const verifyCodeSchema = z.object({ email: emailSchema, code: codeSchema });
const resetPasswordSchema = verifyCodeSchema.extend({ password: passwordSchema });
const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);
const dataImageSchema = z.string().max(450_000).regex(/^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/);
const avatarSchema = z.union([httpUrlSchema, dataImageSchema, z.literal(''), z.null()]);

function codeResponse(issued) {
  return {
    expires_in: 10 * 60,
    resend_after: issued.resendAfter,
    ...(process.env.NODE_ENV === 'test' ? { test_code: issued.code } : {}),
  };
}

async function deliverCode({ issued, email, name, purpose }) {
  try {
    await sendAuthenticationCode({ to: email, name, code: issued.code, purpose, requestId: issued.id });
  } catch (error) {
    await revokeAuthCode(issued.id);
    throw error;
  }
}

router.post('/register', authLimiter, asyncRoute(async (req, res) => {
  const input = parse(registerSchema, req.body);
  const existing = await getDb().execute({
    sql: 'SELECT id FROM users WHERE email = ? COLLATE NOCASE',
    args: [input.email],
  });
  if (existing.rows.length) throw new AppError(409, 'Ese correo ya está registrado.', 'EMAIL_TAKEN');

  const issued = await issueAuthCode({
    email: input.email,
    purpose: 'registration',
    payload: {
      name: input.name,
      password_hash: await hashPassword(input.password),
      timezone: input.timezone,
    },
  });
  await deliverCode({ issued, email: input.email, name: input.name, purpose: 'registration' });
  res.status(202).json({
    verification_required: true,
    email: input.email,
    ...codeResponse(issued),
  });
}));

router.post('/register/resend', authLimiter, asyncRoute(async (req, res) => {
  const input = parse(emailOnlySchema, req.body);
  const issued = await issueAuthCode({ email: input.email, purpose: 'registration' });
  await deliverCode({ issued, email: input.email, name: issued.payload.name, purpose: 'registration' });
  res.status(202).json({ email: input.email, ...codeResponse(issued) });
}));

router.post('/register/verify', authLimiter, asyncRoute(async (req, res) => {
  const input = parse(verifyCodeSchema, req.body);
  const verified = await verifyAuthCode({ email: input.email, purpose: 'registration', code: input.code });
  const existing = await getDb().execute({
    sql: 'SELECT id FROM users WHERE email = ? COLLATE NOCASE',
    args: [input.email],
  });
  if (existing.rows.length) {
    await revokeAuthCode(verified.id);
    throw new AppError(409, 'Ese correo ya está registrado.', 'EMAIL_TAKEN');
  }

  const user = {
    id: randomUUID(),
    name: verified.payload.name,
    email: input.email,
    avatar_url: null,
    avatar_color: '#4f46e5',
    accent_color: '#4f46e5',
    timezone: verified.payload.timezone,
    theme: 'system',
    email_notifications: 1,
    token_version: 0,
  };
  await getDb().batch([
    {
      sql: `INSERT INTO users (id, name, email, password_hash, timezone)
            VALUES (?, ?, ?, ?, ?)`,
      args: [user.id, user.name, user.email, verified.payload.password_hash, user.timezone],
    },
    { sql: 'DELETE FROM auth_codes WHERE id = ?', args: [verified.id] },
  ], 'write');
  createSession(res, user);
  res.status(201).json({ user });
}));

router.post('/password/forgot', authLimiter, asyncRoute(async (req, res) => {
  const input = parse(emailOnlySchema, req.body);
  const result = await getDb().execute({
    sql: 'SELECT id, name, email FROM users WHERE email = ? COLLATE NOCASE AND deleted_at IS NULL',
    args: [input.email],
  });
  const user = result.rows[0];
  const response = {
    message: 'Si existe una cuenta con ese correo, recibirás un código en unos minutos.',
    expires_in: 10 * 60,
    resend_after: 60,
  };
  if (!user) return res.status(202).json(response);

  let issued;
  try {
    issued = await issueAuthCode({
      email: user.email,
      purpose: 'password_reset',
      payload: { user_id: user.id, name: user.name },
    });
  } catch (error) {
    if (error.code === 'CODE_COOLDOWN') {
      return res.status(202).json({ ...response, resend_after: error.details.retry_after });
    }
    throw error;
  }
  await deliverCode({ issued, email: user.email, name: user.name, purpose: 'password_reset' });
  res.status(202).json({ ...response, ...codeResponse(issued) });
}));

router.post('/password/reset', authLimiter, asyncRoute(async (req, res) => {
  const input = parse(resetPasswordSchema, req.body);
  const verified = await verifyAuthCode({ email: input.email, purpose: 'password_reset', code: input.code });
  const user = await getDb().execute({
    sql: 'SELECT id FROM users WHERE id = ? AND email = ? COLLATE NOCASE AND deleted_at IS NULL',
    args: [verified.payload.user_id, input.email],
  });
  if (!user.rows.length) {
    await revokeAuthCode(verified.id);
    throw new AppError(400, 'El código no es válido o ya expiró.', 'INVALID_CODE');
  }
  await getDb().batch([
    {
      sql: `UPDATE users SET password_hash = ?, token_version = token_version + 1,
            updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [await hashPassword(input.password), verified.payload.user_id],
    },
    { sql: 'DELETE FROM auth_codes WHERE id = ?', args: [verified.id] },
  ], 'write');
  clearSession(res);
  res.json({ message: 'Tu contraseña fue actualizada. Ya puedes iniciar sesión.' });
}));

router.post('/login', authLimiter, asyncRoute(async (req, res) => {
  const input = parse(z.object({ email: emailSchema, password: z.string().min(1).max(128) }), req.body);
  const result = await getDb().execute({
    sql: `SELECT id, name, email, password_hash, avatar_url, avatar_color, accent_color, timezone, theme,
                 email_notifications, token_version
          FROM users WHERE email = ? COLLATE NOCASE AND deleted_at IS NULL`,
    args: [input.email],
  });
  const user = result.rows[0];
  if (!user || !(await comparePassword(input.password, user.password_hash))) {
    throw new AppError(401, 'Correo o contraseña incorrectos.', 'INVALID_CREDENTIALS');
  }
  delete user.password_hash;
  createSession(res, user);
  res.json({ user });
}));

router.post('/logout', (_req, res) => {
  clearSession(res);
  res.status(204).end();
});

router.get('/me', asyncRoute(requireUser), asyncRoute(async (req, res) => {
  const groups = await getDb().execute({
    sql: `SELECT g.id, g.name, g.description, g.join_code, g.archived_at, gm.role,
                 (SELECT COUNT(*) FROM group_members x WHERE x.group_id = g.id) AS member_count
          FROM group_members gm JOIN groups g ON g.id = gm.group_id
          WHERE gm.user_id = ? ORDER BY g.archived_at IS NOT NULL, g.updated_at DESC`,
    args: [req.user.id],
  });
  res.json({ user: req.user, groups: groups.rows });
}));

const profileSchema = z.object({
  name: nameSchema.optional(),
  avatar_url: avatarSchema.optional(),
  avatar_color: colorSchema.optional(),
  accent_color: colorSchema.optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  email_notifications: z.boolean().optional(),
});

router.patch('/me', asyncRoute(requireUser), asyncRoute(async (req, res) => {
  const input = parse(profileSchema, req.body);
  const updated = {
    name: input.name ?? req.user.name,
    avatar_url: input.avatar_url === '' ? null : (input.avatar_url ?? req.user.avatar_url),
    avatar_color: input.avatar_color ?? req.user.avatar_color,
    accent_color: input.accent_color ?? req.user.accent_color,
    timezone: input.timezone ?? req.user.timezone,
    theme: input.theme ?? req.user.theme,
    email_notifications: input.email_notifications === undefined
      ? Number(req.user.email_notifications)
      : Number(input.email_notifications),
  };
  await getDb().execute({
    sql: `UPDATE users SET name = ?, avatar_url = ?, avatar_color = ?, accent_color = ?, timezone = ?, theme = ?,
          email_notifications = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    args: [updated.name, updated.avatar_url, updated.avatar_color, updated.accent_color, updated.timezone, updated.theme, updated.email_notifications, req.user.id],
  });
  res.json({ user: { ...req.user, ...updated } });
}));

router.delete('/me', asyncRoute(requireUser), asyncRoute(async (req, res) => {
  const adminCount = await getDb().execute({
    sql: `SELECT COUNT(*) AS count FROM group_members gm
          WHERE gm.user_id = ? AND gm.role = 'admin'
          AND NOT EXISTS (
            SELECT 1 FROM group_members other
            WHERE other.group_id = gm.group_id AND other.role = 'admin' AND other.user_id <> gm.user_id
          )`,
    args: [req.user.id],
  });
  if (Number(adminCount.rows[0].count) > 0) {
    throw new AppError(409, 'Transfiere la administración de tus grupos antes de eliminar tu cuenta.', 'LAST_ADMIN');
  }
  await getDb().batch([
    { sql: 'DELETE FROM group_members WHERE user_id = ?', args: [req.user.id] },
    { sql: `UPDATE users SET deleted_at = CURRENT_TIMESTAMP, token_version = token_version + 1,
            email = id || '@deleted.invalid' WHERE id = ?`, args: [req.user.id] },
  ], 'write');
  clearSession(res);
  res.status(204).end();
}));

export default router;
