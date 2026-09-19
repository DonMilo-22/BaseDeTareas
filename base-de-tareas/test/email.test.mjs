import test from "node:test";
import assert from "node:assert/strict";
import {
  escapeHtml,
  formatDueDate,
  resolveRecipients,
  sendTaskCreatedNotifications,
} from "../api/_email.js";

test("escapeHtml protege el contenido de las tareas", () => {
  assert.equal(escapeHtml('<script>alert("x")</script>'), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
});

test("formatDueDate devuelve una fecha legible en español", () => {
  const formatted = formatDueDate("2026-09-20T14:00:00.000Z");
  assert.match(formatted, /2026/);
});

test("resolveRecipients elimina duplicados y cuentas de demostración", () => {
  delete process.env.EMAIL_RECIPIENT_OVERRIDE;
  const recipients = resolveRecipients([
    { id: 1, name: "Uno", email: "UNO@correo.com" },
    { id: 2, name: "Duplicado", email: "uno@correo.com" },
    { id: 3, name: "Demo", email: "demo@estudiante.com" },
  ]);
  assert.deepEqual(recipients, [{ id: 1, name: "Uno", email: "uno@correo.com" }]);
});

test("resolveRecipients redirige una sola copia durante las pruebas", () => {
  process.env.EMAIL_RECIPIENT_OVERRIDE = "milo@correo.com";
  const recipients = resolveRecipients([
    { id: 1, name: "Uno", email: "uno@correo.com" },
    { id: 2, name: "Dos", email: "dos@correo.com" },
  ]);
  assert.deepEqual(recipients, [{ id: "test", name: "Prueba de notificaciones", email: "milo@correo.com" }]);
  delete process.env.EMAIL_RECIPIENT_OVERRIDE;
});

test("sendTaskCreatedNotifications prepara una solicitud válida para Resend", async () => {
  const originalFetch = global.fetch;
  let request;
  process.env.RESEND_API_KEY = "re_prueba";
  process.env.EMAIL_RECIPIENT_OVERRIDE = "milo@correo.com";

  global.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: "email_123" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await sendTaskCreatedNotifications({
      task: {
        id: "tsk_1",
        title: "Investigación",
        topic: "Tema 1",
        description: "Descripción",
        due_date: "2026-09-20T14:00:00.000Z",
        priority: "alta",
        class_name: "Bases de Datos",
      },
      recipients: [{ id: 7, name: "Emiliano", email: "otro@correo.com" }],
      creatorName: "Emiliano",
    });

    assert.equal(result.sent, 1);
    assert.equal(request.url, "https://api.resend.com/emails");
    assert.equal(request.options.headers.Authorization, "Bearer re_prueba");
    const payload = JSON.parse(request.options.body);
    assert.deepEqual(payload.to, ["milo@correo.com"]);
    assert.equal(payload.from, "Base de Tareas <onboarding@resend.dev>");
    assert.match(payload.subject, /Investigación/);
  } finally {
    global.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_RECIPIENT_OVERRIDE;
  }
});
