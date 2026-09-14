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

  // Crear índices para mayor velocidad
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_tasks_class ON tasks(class_id);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_completions_task ON task_completions(task_id);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_completions_user ON task_completions(user_id);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC);`);

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
