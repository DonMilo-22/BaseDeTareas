import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { parse as parseCookie, serialize as serializeCookie } from 'cookie';
import { config } from './config.js';
import { getDb } from './db.js';
import { AppError } from './errors.js';

const COOKIE_NAME = 'bdt_session';
const SESSION_DAYS = 14;

export const hashPassword = password => bcrypt.hash(password, 12);
export const comparePassword = (password, hash) => bcrypt.compare(password, hash);

function sessionCookie(value, maxAge) {
  return serializeCookie(COOKIE_NAME, value, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

export function createSession(res, user) {
  const token = jwt.sign(
    { sub: user.id, ver: Number(user.token_version || 0) },
    config.jwtSecret,
    { expiresIn: `${SESSION_DAYS}d`, issuer: 'base-de-tareas', audience: 'base-de-tareas-web' },
  );
  res.setHeader('Set-Cookie', sessionCookie(token, SESSION_DAYS * 24 * 60 * 60));
}

export function clearSession(res) {
  res.setHeader('Set-Cookie', sessionCookie('', 0));
}

function readToken(req) {
  const cookies = parseCookie(req.headers.cookie || '');
  if (cookies[COOKIE_NAME]) return cookies[COOKIE_NAME];
  const authorization = req.headers.authorization || '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
}

export async function optionalUser(req) {
  const token = readToken(req);
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret, {
      issuer: 'base-de-tareas',
      audience: 'base-de-tareas-web',
    });
    const result = await getDb().execute({
      sql: `SELECT id, name, email, avatar_url, avatar_color, accent_color, timezone, theme, email_notifications, token_version
            FROM users WHERE id = ? AND deleted_at IS NULL`,
      args: [payload.sub],
    });
    const user = result.rows[0];
    if (!user || Number(user.token_version) !== Number(payload.ver)) return null;
    return user;
  } catch {
    return null;
  }
}

export async function requireUser(req, _res, next) {
  const user = await optionalUser(req);
  if (!user) throw new AppError(401, 'Tu sesión no es válida o expiró.', 'UNAUTHORIZED');
  req.user = user;
  next();
}
