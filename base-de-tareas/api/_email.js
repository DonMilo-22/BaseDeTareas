const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "Base de Tareas <onboarding@resend.dev>";
const DEFAULT_APP_URL = "https://basedetareas.vercel.app";

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatDueDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha por confirmar";

  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Merida",
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

function getAppUrl() {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return DEFAULT_APP_URL;
}

function isDeliverableEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return false;

  // Evita gastar envíos y generar rebotes con las cuentas de demostración.
  return !normalized.endsWith("@example.com") &&
    !normalized.endsWith("@estudiante.com") &&
    !normalized.endsWith(".invalid");
}

export function resolveRecipients(recipients = []) {
  const override = process.env.EMAIL_RECIPIENT_OVERRIDE?.trim();
  if (override) {
    return recipients.length > 0 && isDeliverableEmail(override)
      ? [{ id: "test", name: "Prueba de notificaciones", email: override }]
      : [];
  }

  const unique = new Map();
  for (const recipient of recipients) {
    const email = String(recipient?.email || "").trim().toLowerCase();
    if (isDeliverableEmail(email) && !unique.has(email)) {
      unique.set(email, { ...recipient, email });
    }
  }
  return [...unique.values()];
}

async function sendResendEmail({ to, subject, html, text, idempotencyKey }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("RESEND_API_KEY no está configurada; correo omitido.");
    return { skipped: true, reason: "missing_api_key" };
  }

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message || `Resend respondió con HTTP ${response.status}`);
  }
  return { id: body.id, skipped: false };
}

function emailLayout({ eyebrow, title, greeting, content, task, buttonText }) {
  const appUrl = escapeHtml(getAppUrl());
  const safeTitle = escapeHtml(task.title);
  const safeClass = escapeHtml(task.class_name || "Clase");
  const safeTopic = escapeHtml(task.topic || "Tema 1");
  const safePriority = escapeHtml(task.priority || "media");
  const safeDescription = escapeHtml(task.description || "Sin descripción");
  const dueDate = escapeHtml(formatDueDate(task.due_date));

  return `<!doctype html>
  <html lang="es">
    <body style="margin:0;background:#0f1020;color:#f7f7fb;font-family:Arial,sans-serif;padding:24px">
      <div style="max-width:620px;margin:0 auto;background:#191a2e;border:1px solid #343654;border-radius:20px;overflow:hidden">
        <div style="padding:28px;background:linear-gradient(135deg,#6657e8,#8b5cf6)">
          <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;opacity:.85">${escapeHtml(eyebrow)}</div>
          <h1 style="margin:8px 0 0;font-size:28px">${escapeHtml(title)}</h1>
        </div>
        <div style="padding:28px">
          <p style="font-size:17px">${escapeHtml(greeting)}</p>
          <p style="color:#c7c8da;line-height:1.6">${escapeHtml(content)}</p>
          <div style="margin:24px 0;padding:20px;background:#111222;border-radius:14px;border:1px solid #30324b">
            <h2 style="margin:0 0 14px;font-size:21px">${safeTitle}</h2>
            <p style="margin:7px 0"><strong>Materia:</strong> ${safeClass}</p>
            <p style="margin:7px 0"><strong>Tema:</strong> ${safeTopic}</p>
            <p style="margin:7px 0"><strong>Entrega:</strong> ${dueDate}</p>
            <p style="margin:7px 0"><strong>Prioridad:</strong> ${safePriority}</p>
            <p style="margin:14px 0 0;color:#c7c8da;line-height:1.5">${safeDescription}</p>
          </div>
          <a href="${appUrl}" style="display:inline-block;padding:13px 20px;background:#7c6cf2;color:white;text-decoration:none;border-radius:10px;font-weight:bold">${escapeHtml(buttonText)}</a>
        </div>
      </div>
    </body>
  </html>`;
}

export async function sendTaskCreatedNotifications({ task, recipients, creatorName }) {
  const targets = resolveRecipients(recipients);
  const results = [];

  for (const recipient of targets) {
    try {
      const result = await sendResendEmail({
        to: recipient.email,
        subject: `Nueva tarea: ${task.title}`,
        html: emailLayout({
          eyebrow: "Nueva tarea",
          title: "Se agregó una tarea",
          greeting: `Hola ${recipient.name || "estudiante"},`,
          content: `${creatorName || "Un compañero"} agregó una nueva tarea al grupo.`,
          task,
          buttonText: "Ver tarea",
        }),
        text: `Nueva tarea: ${task.title}\nMateria: ${task.class_name}\nEntrega: ${formatDueDate(task.due_date)}\n\n${getAppUrl()}`,
        idempotencyKey: `task-created-${task.id}-${recipient.id}`,
      });
      results.push({ recipient: recipient.email, ...result });
    } catch (error) {
      console.error(`No se pudo avisar a ${recipient.email}:`, error.message);
      results.push({ recipient: recipient.email, error: error.message });
    }
  }

  return {
    attempted: targets.length,
    sent: results.filter(item => item.id).length,
    skipped: results.filter(item => item.skipped).length,
    failed: results.filter(item => item.error).length,
  };
}

export async function sendDueReminder({ task, recipient, notificationKey }) {
  return sendResendEmail({
    to: recipient.email,
    subject: `Recordatorio: ${task.title} vence pronto`,
    html: emailLayout({
      eyebrow: "Recordatorio de entrega",
      title: "Tu tarea vence en menos de 24 horas",
      greeting: `Hola ${recipient.name || "estudiante"},`,
      content: "Esta tarea sigue marcada como pendiente. Revísala antes de la fecha límite.",
      task,
      buttonText: "Abrir Base de Tareas",
    }),
    text: `Recordatorio: ${task.title}\nMateria: ${task.class_name}\nEntrega: ${formatDueDate(task.due_date)}\n\n${getAppUrl()}`,
    idempotencyKey: notificationKey,
  });
}
