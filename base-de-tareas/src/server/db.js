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
        CREATE INDEX IF NOT EXISTS idx_announcements_group ON announcements(group_id, event_at, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_announcement_reminders_user ON announcement_reminders(user_id, status);
        INSERT OR IGNORE INTO schema_migrations (version, name)
        VALUES (3, 'announcements_and_profile_customization');
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
