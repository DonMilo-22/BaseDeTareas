import { createClient } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config();

// Conectar con Turso si existen las variables, o fallback a archivo SQLite local
const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  throw new Error("TURSO_DATABASE_URL is missing");
}

if (!authToken) {
  throw new Error("TURSO_AUTH_TOKEN is missing");
}

export const db = createClient({
  url,
  authToken,
});

export function generateId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36)}`;
}

export async function getTableColumns(tableName) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(tableName)) {
    throw new Error("Nombre de tabla inválido");
  }

  const result = await db.execute(`PRAGMA table_info(${tableName});`);
  return result.rows;
}

export async function tableHasColumn(tableName, columnName) {
  const columns = await getTableColumns(tableName);
  return columns.some((column) => column.name === columnName);
}

// Las primeras versiones de la aplicación exigían que cada clase perteneciera
// a un grupo. Conservamos ese esquema si ya existe en Turso y creamos un grupo
// principal transparente para la interfaz simplificada actual.
export async function ensureLegacyGroupForUser(userId) {
  if (!(await tableHasColumn("classes", "group_id"))) return null;
  const compatibleUserId = String(userId);

  const membership = await db.execute({
    sql: `SELECT group_id FROM group_members
          WHERE CAST(user_id AS TEXT) = CAST(? AS TEXT)
          ORDER BY joined_at ASC LIMIT 1;`,
    args: [compatibleUserId],
  });
  if (membership.rows[0]?.group_id) return membership.rows[0].group_id;

  const ownedGroup = await db.execute({
    sql: `SELECT id FROM groups
          WHERE CAST(created_by AS TEXT) = CAST(? AS TEXT)
          ORDER BY created_at ASC LIMIT 1;`,
    args: [compatibleUserId],
  });

  let groupId = ownedGroup.rows[0]?.id;
  if (!groupId) {
    groupId = generateId("grp");
    const joinCode = Math.random().toString(36).slice(2, 10).toUpperCase();
    await db.execute({
      sql: `INSERT INTO groups (id, name, description, join_code, created_by)
            VALUES (?, ?, ?, ?, ?);`,
      args: [groupId, "Base de Tareas", "Grupo principal", joinCode, compatibleUserId],
    });
  }

  await db.execute({
    sql: `INSERT OR IGNORE INTO group_members (group_id, user_id, role)
          VALUES (?, ?, 'admin');`,
    args: [groupId, compatibleUserId],
  });

  return groupId;
}

let isInitialized = false;

export async function initDatabase() {
  if (isInitialized) return;

  await db.execute("PRAGMA foreign_keys = ON;");

  // Crear tablas principales
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT,
      teacher TEXT,
      schedule TEXT,
      color TEXT DEFAULT '#6366f1',
      icon TEXT DEFAULT '📚',
      created_by TEXT REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      due_date DATETIME NOT NULL,
      priority TEXT DEFAULT 'media',
      photos TEXT DEFAULT '[]',
      created_by TEXT REFERENCES users(id),
      updated_by TEXT REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS task_completions (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      completed INTEGER DEFAULT 1,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(task_id, user_id)
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      action_type TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      target_title TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS email_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      notification_type TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      provider_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      sent_at DATETIME,
      UNIQUE(task_id, user_id, notification_type)
    );
  `);

  // Compatibilidad con bases Turso creadas con versiones anteriores.
  const activityMigrations = [
    "ALTER TABLE activity_logs ADD COLUMN action_type TEXT",
    "ALTER TABLE activity_logs ADD COLUMN target_type TEXT",
    "ALTER TABLE activity_logs ADD COLUMN target_id TEXT",
    "ALTER TABLE activity_logs ADD COLUMN target_title TEXT",
    "ALTER TABLE activity_logs ADD COLUMN details TEXT",
    "ALTER TABLE activity_logs ADD COLUMN created_at DATETIME",
  ];

  for (const statement of activityMigrations) {
    try {
      await db.execute(statement);
    } catch (error) {
      // La columna ya existe.
    }
  }

  await db.execute(`
    UPDATE activity_logs
    SET created_at = CURRENT_TIMESTAMP
    WHERE created_at IS NULL
  `);

  // Completar esquemas antiguos sin eliminar la información existente.
  const legacyMigrations = [
    "ALTER TABLE users ADD COLUMN name TEXT",
    "ALTER TABLE users ADD COLUMN email TEXT",
    "ALTER TABLE users ADD COLUMN password_hash TEXT",
    "ALTER TABLE users ADD COLUMN avatar_url TEXT",
    "ALTER TABLE users ADD COLUMN created_at DATETIME",
    "ALTER TABLE classes ADD COLUMN code TEXT",
    "ALTER TABLE classes ADD COLUMN teacher TEXT",
    "ALTER TABLE classes ADD COLUMN schedule TEXT",
    "ALTER TABLE classes ADD COLUMN color TEXT DEFAULT '#6366f1'",
    "ALTER TABLE classes ADD COLUMN icon TEXT DEFAULT '📚'",
    "ALTER TABLE classes ADD COLUMN created_by INTEGER",
    "ALTER TABLE classes ADD COLUMN created_at DATETIME",
    "ALTER TABLE classes ADD COLUMN topics TEXT DEFAULT '[\"Tema 1\", \"Tema 2\", \"Tema 3\"]'",
    "ALTER TABLE tasks ADD COLUMN class_id TEXT",
    "ALTER TABLE tasks ADD COLUMN title TEXT",
    "ALTER TABLE tasks ADD COLUMN description TEXT",
    "ALTER TABLE tasks ADD COLUMN due_date DATETIME",
    "ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT 'media'",
    "ALTER TABLE tasks ADD COLUMN photos TEXT DEFAULT '[]'",
    "ALTER TABLE tasks ADD COLUMN created_by INTEGER",
    "ALTER TABLE tasks ADD COLUMN updated_by INTEGER",
    "ALTER TABLE tasks ADD COLUMN created_at DATETIME",
    "ALTER TABLE tasks ADD COLUMN updated_at DATETIME",
    "ALTER TABLE tasks ADD COLUMN topic TEXT DEFAULT 'Tema 1'",
    "ALTER TABLE task_completions ADD COLUMN task_id TEXT",
    "ALTER TABLE task_completions ADD COLUMN user_id INTEGER",
    "ALTER TABLE task_completions ADD COLUMN completed INTEGER DEFAULT 1",
    "ALTER TABLE task_completions ADD COLUMN completed_at DATETIME",
  ];

  for (const statement of legacyMigrations) {
    try {
      await db.execute(statement);
    } catch (error) {
      // La columna ya existe.
    }
  }

  if (await tableHasColumn("tasks", "due_at")) {
    await db.execute(`
      UPDATE tasks
      SET due_date = due_at
      WHERE due_date IS NULL AND due_at IS NOT NULL;
    `);
  }

  if (await tableHasColumn("activity_logs", "action")) {
    await db.execute(`
      UPDATE activity_logs
      SET action_type = COALESCE(action_type, action),
          target_type = COALESCE(target_type, entity_type),
          target_id = COALESCE(target_id, entity_id),
          details = COALESCE(details, summary)
      WHERE action_type IS NULL OR target_type IS NULL OR details IS NULL;
    `);
  }

  // En SQLite una PRIMARY KEY de tipo TEXT puede contener NULL. Una versión
  // anterior registraba usuarios usando rowid, así que alineamos ambos valores
  // sin borrar cuentas ni invalidar las sesiones que ya fueron emitidas.
  const usersWithoutId = await db.execute(
    "SELECT rowid FROM users WHERE id IS NULL OR TRIM(CAST(id AS TEXT)) = '';"
  );
  for (const user of usersWithoutId.rows) {
    let compatibleId = String(user.rowid);
    const collision = await db.execute({
      sql: "SELECT 1 FROM users WHERE CAST(id AS TEXT) = ? LIMIT 1;",
      args: [compatibleId],
    });
    if (collision.rows.length > 0) compatibleId = generateId("usr");
    await db.execute({
      sql: "UPDATE users SET id = ? WHERE rowid = ?;",
      args: [compatibleId, user.rowid],
    });
  }

  // Crear índices para mayor velocidad
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_tasks_class ON tasks(class_id);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_completions_task ON task_completions(task_id);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_completions_user ON task_completions(user_id);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_email_notifications_task ON email_notifications(task_id);`);

  // Migración segura para Temas en clases y tareas
  try {
    await db.execute(`ALTER TABLE classes ADD COLUMN topics TEXT DEFAULT '["Tema 1", "Tema 2", "Tema 3"]';`);
  } catch (e) {
    // Columna ya existe
  }

  try {
    await db.execute(`ALTER TABLE tasks ADD COLUMN topic TEXT DEFAULT 'Tema 1';`);
  } catch (e) {
    // Columna ya existe
  }

  // Tablas e índices inicializados listos para producción
  isInitialized = true;
}
