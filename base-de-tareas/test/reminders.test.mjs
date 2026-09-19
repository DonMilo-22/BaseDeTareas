import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("el cron envía una sola vez y evita recordatorios duplicados", async () => {
  const directory = await mkdtemp(join(tmpdir(), "base-tareas-email-"));
  const originalFetch = global.fetch;
  let fetchCalls = 0;

  process.env.TURSO_DATABASE_URL = `file:${join(directory, "test.db")}`;
  process.env.TURSO_AUTH_TOKEN = "test";
  process.env.CRON_SECRET = "cron-test-secret";
  process.env.RESEND_API_KEY = "re_prueba";
  process.env.EMAIL_RECIPIENT_OVERRIDE = "milo@correo.com";

  global.fetch = async () => {
    fetchCalls++;
    return new Response(JSON.stringify({ id: `email_${fetchCalls}` }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const { db, initDatabase } = await import("../api/_db.js");
    const { default: remindersHandler } = await import("../api/cron/reminders.js");
    await initDatabase();

    await db.execute({
      sql: "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?);",
      args: ["Emiliano", "emiliano@correo.com", "hash"],
    });
    await db.execute({
      sql: "INSERT INTO classes (name, code) VALUES (?, ?);",
      args: ["Bases de Datos", "BD-1"],
    });
    await db.execute({
      sql: `INSERT INTO tasks (id, class_id, title, topic, due_date, priority)
            VALUES (?, ?, ?, ?, ?, ?);`,
      args: [
        "tsk_test",
        "1",
        "Investigación",
        "Tema 1",
        new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        "alta",
      ],
    });

    const request = {
      method: "GET",
      headers: { authorization: "Bearer cron-test-secret" },
    };

    const firstResponse = createResponse();
    await remindersHandler(request, firstResponse);
    assert.equal(firstResponse.statusCode, 200);
    assert.equal(firstResponse.body.sent, 1);
    assert.equal(fetchCalls, 1);

    const secondResponse = createResponse();
    await remindersHandler(request, secondResponse);
    assert.equal(secondResponse.statusCode, 200);
    assert.equal(secondResponse.body.sent, 0);
    assert.equal(secondResponse.body.skipped, 1);
    assert.equal(fetchCalls, 1);

    db.close();
  } finally {
    global.fetch = originalFetch;
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    delete process.env.CRON_SECRET;
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_RECIPIENT_OVERRIDE;
    await rm(directory, { recursive: true, force: true });
  }
});
