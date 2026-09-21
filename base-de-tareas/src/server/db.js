import { createClient } from '@libsql/client';
import { config } from './config.js';

let client;
let schemaPromise;

export function getDb() {
  if (!client) client = createClient({ url: config.databaseUrl, authToken: config.databaseAuthToken });
  return client;
}

export async function checkDatabase() {
  const result = await getDb().execute('SELECT 1 AS ok');
  return Number(result.rows[0]?.ok) === 1;
}

export async function ensureRuntimeSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const db = getDb();
      const columns = await db.execute('PRAGMA table_info(users)');
      const names = new Set(columns.rows.map(column => String(column.name)));
      if (!names.has('avatar_color')) await db.execute("ALTER TABLE users ADD COLUMN avatar_color TEXT NOT NULL DEFAULT '#4f46e5'");
      if (!names.has('accent_color')) await db.execute("ALTER TABLE users ADD COLUMN accent_color TEXT NOT NULL DEFAULT '#4f46e5'");
      await db.executeMultiple(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS auth_codes (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL COLLATE NOCASE,
          purpose TEXT NOT NULL CHECK (purpose IN ('registration', 'password_reset')),
          code_hash TEXT NOT NULL,
          payload_json TEXT NOT NULL DEFAULT '{}',
          attempts INTEGER NOT NULL DEFAULT 0,
          expires_at TEXT NOT NULL,
          resend_available_at TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (email, purpose)
        );
        CREATE TABLE IF NOT EXISTS announcements (
          id TEXT PRIMARY KEY,
          group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id),
          body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
          event_at TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          deleted_at TEXT
        );
        CREATE TABLE IF NOT EXISTS announcement_reminders (
          id TEXT PRIMARY KEY,
          announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          remind_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'sent', 'failed', 'cancelled')),
          provider_email_id TEXT,
          last_error TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (announcement_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          endpoint TEXT NOT NULL UNIQUE,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          user_agent TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS push_notification_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          notification_type TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (user_id, entity_type, entity_id, notification_type)
        );
        CREATE TABLE IF NOT EXISTS personal_reminders (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
          task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
          announcement_id TEXT REFERENCES announcements(id) ON DELETE SET NULL,
          message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 500),
          remind_at TEXT NOT NULL,
          email_enabled INTEGER NOT NULL DEFAULT 0 CHECK (email_enabled IN (0, 1)),
          push_enabled INTEGER NOT NULL DEFAULT 0 CHECK (push_enabled IN (0, 1)),
          email_status TEXT NOT NULL DEFAULT 'disabled' CHECK (email_status IN ('disabled', 'pending', 'scheduled', 'sent', 'failed', 'cancelled')),
          push_status TEXT NOT NULL DEFAULT 'disabled' CHECK (push_status IN ('disabled', 'pending', 'scheduled', 'sent', 'failed', 'cancelled')),
          provider_email_id TEXT,
          qstash_message_id TEXT,
          schedule_version INTEGER NOT NULL DEFAULT 1,
          last_error TEXT,
          delivered_at TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CHECK (email_enabled = 1 OR push_enabled = 1),
          CHECK (task_id IS NULL OR announcement_id IS NULL)
        );
        CREATE INDEX IF NOT EXISTS idx_announcements_group ON announcements(group_id, event_at, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_announcement_reminders_user ON announcement_reminders(user_id, status);
        CREATE INDEX IF NOT EXISTS idx_auth_codes_expiry ON auth_codes(expires_at);
        CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
        CREATE INDEX IF NOT EXISTS idx_push_notification_log_entity ON push_notification_log(entity_type, entity_id);
        CREATE INDEX IF NOT EXISTS idx_personal_reminders_queue ON personal_reminders(user_id, group_id, remind_at);
        CREATE INDEX IF NOT EXISTS idx_personal_reminders_pending ON personal_reminders(email_status, push_status, remind_at);
        INSERT OR IGNORE INTO schema_migrations (version, name)
        VALUES (3, 'announcements_and_profile_customization');
        INSERT OR IGNORE INTO schema_migrations (version, name)
        VALUES (4, 'email_verification_and_password_reset');
        INSERT OR IGNORE INTO schema_migrations (version, name)
        VALUES (5, 'web_push_notifications');
        INSERT OR IGNORE INTO schema_migrations (version, name)
        VALUES (6, 'personal_reminder_center');
      `);
    })().catch(error => {
      schemaPromise = undefined;
      throw error;
    });
  }
  return schemaPromise;
}

export async function transaction(statements) {
  return getDb().batch(statements, 'write');
}

export function resetDbForTests() {
  if (client) client.close();
  client = undefined;
  schemaPromise = undefined;
}
