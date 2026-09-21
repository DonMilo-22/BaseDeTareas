import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
const databaseUrl = process.env.TURSO_DATABASE_URL || (isProduction ? '' : 'file:./database/local.db');
const jwtSecret = process.env.JWT_SECRET || (isProduction ? '' : 'development-only-secret-change-me-123456');
const appUrl = (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');

if (!databaseUrl) throw new Error('Falta TURSO_DATABASE_URL.');
if (!jwtSecret || jwtSecret.length < 32) throw new Error('JWT_SECRET debe tener por lo menos 32 caracteres.');

export const config = Object.freeze({
  isProduction,
  port: Number(process.env.PORT || 3000),
  databaseUrl,
  databaseAuthToken: process.env.TURSO_AUTH_TOKEN || undefined,
  jwtSecret,
  appUrl,
  resendApiKey: process.env.RESEND_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL || '',
  emailRecipientOverride: process.env.EMAIL_RECIPIENT_OVERRIDE || '',
  cronSecret: process.env.CRON_SECRET || '',
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || (appUrl.startsWith('https://') ? appUrl : 'mailto:local@base-de-tareas.test'),
  qstashToken: process.env.QSTASH_TOKEN || '',
  qstashCurrentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY || '',
  qstashNextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || '',
});
