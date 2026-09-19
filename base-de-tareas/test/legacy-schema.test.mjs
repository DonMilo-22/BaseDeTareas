import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import jwt from "jsonwebtoken";
import { createClient } from "@libsql/client";

function responseMock() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

test("la API funciona sobre el esquema Turso anterior sin borrar datos", async () => {
  const directory = await mkdtemp(join(tmpdir(), "base-tareas-legacy-"));
  const databasePath = join(directory, "legacy.db");
  const client = createClient({ url: `file:${databasePath}` });

  await client.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      avatar_url TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      join_code TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      archived_at TEXT
    );
    CREATE TABLE group_members (
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (group_id, user_id)
    );
    CREATE TABLE classes (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT NOT NULL DEFAULT '',
      teacher TEXT NOT NULL DEFAULT '',
      schedule TEXT NOT NULL DEFAULT '',
      room TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#6366f1',
      icon TEXT NOT NULL DEFAULT 'book-open',
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      due_at TEXT NOT NULL,
      is_important INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL REFERENCES users(id),
      updated_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE task_completions (
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (task_id, user_id)
    );
    CREATE TABLE activity_logs (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      summary TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO users (name, email, password_hash)
    VALUES ('Emiliano', 'legacy@estudiante.com', 'hash-anterior');
  `);
  client.close();

  process.env.TURSO_DATABASE_URL = `file:${databasePath}`;
  process.env.TURSO_AUTH_TOKEN = "local-test-token";
  process.env.JWT_SECRET = "legacy-test-secret";

  const [{ default: classesHandler }, { default: tasksHandler }, { default: statusHandler }, database] =
    await Promise.all([
      import("../api/classes.js"),
      import("../api/tasks.js"),
      import("../api/tasks/status.js"),
      import("../api/_db.js"),
    ]);

  const token = jwt.sign(
    { id: 1, name: "Emiliano", email: "legacy@estudiante.com" },
    process.env.JWT_SECRET
  );
  const headers = { authorization: `Bearer ${token}` };

  const classResponse = responseMock();
  await classesHandler(
    {
      method: "POST",
      headers,
      body: { name: "Matemáticas", code: "MAT-1", topics: ["Álgebra"] },
    },
    classResponse
  );
  assert.equal(classResponse.statusCode, 201, JSON.stringify(classResponse.payload));

  const taskResponse = responseMock();
  await tasksHandler(
    {
      method: "POST",
      headers,
      body: {
        class_id: classResponse.payload.classId,
        title: "Resolver ejercicios",
        due_date: "2026-09-22T18:00:00.000Z",
        priority: "alta",
      },
    },
    taskResponse
  );
  assert.equal(taskResponse.statusCode, 201, JSON.stringify(taskResponse.payload));

  const completionResponse = responseMock();
  await statusHandler(
    {
      method: "POST",
      headers,
      body: { task_id: taskResponse.payload.taskId, completed: true },
    },
    completionResponse
  );
  assert.equal(completionResponse.statusCode, 200, JSON.stringify(completionResponse.payload));

  const storedClass = await database.db.execute({
    sql: "SELECT group_id FROM classes WHERE id = ?;",
    args: [classResponse.payload.classId],
  });
  const storedTask = await database.db.execute({
    sql: "SELECT group_id, due_at, due_date FROM tasks WHERE id = ?;",
    args: [taskResponse.payload.taskId],
  });
  assert.ok(storedClass.rows[0].group_id);
  assert.equal(storedTask.rows[0].group_id, storedClass.rows[0].group_id);
  assert.equal(storedTask.rows[0].due_at, "2026-09-22T18:00:00.000Z");

  database.db.close();
  await rm(directory, { recursive: true, force: true });
});
