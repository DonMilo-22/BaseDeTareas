import { z } from 'zod';
import { badRequest } from './errors.js';

export const idSchema = z.string().uuid();
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(8).max(128);
export const nameSchema = z.string().trim().min(2).max(80);
export const isoDateSchema = z.string().datetime({ offset: true });

export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details = result.error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message }));
    throw badRequest('Revisa los datos enviados.', details);
  }
  return result.data;
}

export function booleanFromQuery(value) {
  return value === true || value === 'true' || value === '1' || value === 1;
}
