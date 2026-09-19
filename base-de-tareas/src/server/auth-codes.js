import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { getDb } from './db.js';
import { AppError } from './errors.js';

export const AUTH_CODE_TTL_MINUTES = 10;
export const AUTH_CODE_RESEND_SECONDS = 60;
export const AUTH_CODE_MAX_ATTEMPTS = 5;

const expiresIn = milliseconds => new Date(Date.now() + milliseconds).toISOString();

function digest(email, purpose, code) {
  return createHmac('sha256', config.jwtSecret)
    .update(`${purpose}:${email.toLowerCase()}:${code}`)
    .digest('hex');
}

function matchesCode(record, code) {
  const expected = Buffer.from(record.code_hash, 'hex');
  const received = Buffer.from(digest(record.email, record.purpose, code), 'hex');
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function issueAuthCode({ email, purpose, payload }) {
  const db = getDb();
  await db.execute({ sql: 'DELETE FROM auth_codes WHERE expires_at <= ?', args: [new Date().toISOString()] });
  const current = await db.execute({
    sql: 'SELECT id, payload_json, resend_available_at FROM auth_codes WHERE email = ? COLLATE NOCASE AND purpose = ?',
    args: [email, purpose],
  });
  const existing = current.rows[0];
  const retryAfter = existing
    ? Math.ceil((Date.parse(existing.resend_available_at) - Date.now()) / 1000)
    : 0;
  if (retryAfter > 0) {
    throw new AppError(429, `Espera ${retryAfter} segundos antes de pedir otro código.`, 'CODE_COOLDOWN', { retry_after: retryAfter });
  }

  const resolvedPayload = payload ?? (existing ? JSON.parse(existing.payload_json) : null);
  if (!resolvedPayload) throw new AppError(400, 'Solicita un código nuevo.', 'CODE_NOT_FOUND');

  const id = randomUUID();
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = expiresIn(AUTH_CODE_TTL_MINUTES * 60 * 1000);
  const resendAvailableAt = expiresIn(AUTH_CODE_RESEND_SECONDS * 1000);
  await db.execute({
    sql: `INSERT INTO auth_codes
            (id, email, purpose, code_hash, payload_json, attempts, expires_at, resend_available_at)
          VALUES (?, ?, ?, ?, ?, 0, ?, ?)
          ON CONFLICT(email, purpose) DO UPDATE SET
            id = excluded.id, code_hash = excluded.code_hash, payload_json = excluded.payload_json,
            attempts = 0, expires_at = excluded.expires_at,
            resend_available_at = excluded.resend_available_at, created_at = CURRENT_TIMESTAMP`,
    args: [id, email, purpose, digest(email, purpose, code), JSON.stringify(resolvedPayload), expiresAt, resendAvailableAt],
  });
  return { id, code, payload: resolvedPayload, expiresAt, resendAfter: AUTH_CODE_RESEND_SECONDS };
}

export async function revokeAuthCode(id) {
  await getDb().execute({ sql: 'DELETE FROM auth_codes WHERE id = ?', args: [id] });
}

export async function verifyAuthCode({ email, purpose, code }) {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT id, email, purpose, code_hash, payload_json, attempts, expires_at
          FROM auth_codes WHERE email = ? COLLATE NOCASE AND purpose = ?`,
    args: [email, purpose],
  });
  const record = result.rows[0];
  if (!record) throw new AppError(400, 'El código no es válido o ya expiró.', 'INVALID_CODE');
  if (Date.parse(record.expires_at) <= Date.now()) {
    await revokeAuthCode(record.id);
    throw new AppError(400, 'El código expiró. Solicita uno nuevo.', 'CODE_EXPIRED');
  }

  if (!matchesCode(record, code)) {
    const attempts = Number(record.attempts) + 1;
    if (attempts >= AUTH_CODE_MAX_ATTEMPTS) {
      await revokeAuthCode(record.id);
      throw new AppError(429, 'Se agotaron los intentos. Solicita un código nuevo.', 'CODE_ATTEMPTS_EXCEEDED');
    }
    await db.execute({ sql: 'UPDATE auth_codes SET attempts = ? WHERE id = ?', args: [attempts, record.id] });
    throw new AppError(400, `El código no es correcto. Te quedan ${AUTH_CODE_MAX_ATTEMPTS - attempts} intentos.`, 'INVALID_CODE');
  }

  return { id: record.id, payload: JSON.parse(record.payload_json) };
}
