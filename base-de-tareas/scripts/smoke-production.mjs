import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const baseUrl = (process.env.BASE_URL || "").replace(/\/$/, "");
assert(baseUrl, "Falta BASE_URL");

async function request(path, { token, expected, ...options } = {}) {
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(baseUrl + path, { ...options, headers });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${options.method || "GET"} ${path} devolvió contenido no JSON (${response.status})`);
  }

  if (expected && response.status !== expected) {
    throw new Error(`${options.method || "GET"} ${path}: se esperaba ${expected}, llegó ${response.status}: ${JSON.stringify(data)}`);
  }
  if (!expected && !response.ok) {
    throw new Error(`${options.method || "GET"} ${path}: ${response.status}: ${JSON.stringify(data)}`);
  }
  return { response, data };
}

async function waitForDeployment() {
  let lastError;
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      const { data } = await request("/api/health");
      if (data.success === true) return;
      lastError = new Error("La respuesta de salud no confirmó success=true");
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  throw lastError || new Error("La aplicación no estuvo disponible a tiempo");
}

await waitForDeployment();

const htmlResponse = await fetch(baseUrl + "/");
assert.equal(htmlResponse.status, 200);
const html = await htmlResponse.text();
assert.match(html, /id="auth-gate-screen"/);
assert.match(html, /id="app"/);
assert(
  html.indexOf('id="auth-gate-screen"') < html.indexOf('id="app"'),
  "No se encontró la estructura de autenticación esperada"
);

const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
const email = `codex.verificacion.${suffix}@example.com`;
const password = `Prueba-${suffix}!`;
const name = "Codex Verificación";

const registered = await request("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({ name, email, password }),
  expected: 201,
});
assert.equal(registered.data.user.email, email);
assert(Number(registered.data.user.id) > 0);
assert(registered.data.token);

const login = await request("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ email, password }),
  expected: 200,
});
assert.equal(login.data.user.id, registered.data.user.id);
const token = login.data.token;

await request("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ email, password: "incorrecta" }),
  expected: 401,
});

const me = await request("/api/auth/me", { token });
assert.equal(me.data.user.email, email);

const updated = await request("/api/auth/me", {
  method: "PUT",
  token,
  body: JSON.stringify({ name: "Codex Verificación OK", avatar_url: null }),
});
assert.equal(updated.data.user.name, "Codex Verificación OK");
const updatedToken = updated.data.token;

const className = `Materia de prueba ${suffix}`;
const createdClass = await request("/api/classes", {
  method: "POST",
  token: updatedToken,
  body: JSON.stringify({
    name: className,
    code: `TEST-${suffix.slice(0, 8)}`,
    teacher: "Prueba automática",
    schedule: "Temporal",
    color: "#6366f1",
    icon: "🧪",
    topics: ["Tema de verificación"],
  }),
  expected: 201,
});
const classId = createdClass.data.classId;
assert(classId);

const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const createdTask = await request("/api/tasks", {
  method: "POST",
  token: updatedToken,
  body: JSON.stringify({
    class_id: classId,
    title: `Tarea de prueba ${suffix}`,
    topic: "Tema de verificación",
    description: "Creada por la prueba automática de producción.",
    due_date: dueDate,
    priority: "alta",
    photos: [],
  }),
  expected: 201,
});
const taskId = createdTask.data.taskId;
assert(taskId);

let filtered;
let taskWasReturned = false;
for (let attempt = 1; attempt <= 10; attempt++) {
  filtered = await request(
    `/api/tasks?class_id=${encodeURIComponent(classId)}&topic=${encodeURIComponent("Tema de verificación")}`,
    { token: updatedToken }
  );
  taskWasReturned = filtered.data.tasks.some(task => String(task.id) === String(taskId));
  if (taskWasReturned) break;
  await new Promise(resolve => setTimeout(resolve, 3000));
}
const allTasks = await request("/api/tasks", { token: updatedToken });
assert(
  taskWasReturned,
  `La tarea creada ${taskId} no apareció después de reintentos. Filtrada: ${JSON.stringify(filtered.data)}. Todas: ${JSON.stringify(allTasks.data)}`
);

await request("/api/tasks/status", {
  method: "POST",
  token: updatedToken,
  body: JSON.stringify({ task_id: taskId, completed: true }),
});
const stats = await request("/api/stats", { token: updatedToken });
assert(stats.data.myCompletedTasks >= 1);

await request("/api/activity?limit=10", { token: updatedToken });
await request("/api/users", { token: updatedToken });

await request("/api/tasks", {
  method: "DELETE",
  token: updatedToken,
  body: JSON.stringify({ id: taskId }),
});
await request("/api/classes", {
  method: "DELETE",
  token: updatedToken,
  body: JSON.stringify({ id: classId }),
});

const afterDelete = await request(
  `/api/tasks?class_id=${encodeURIComponent(classId)}`,
  { token: updatedToken }
);
assert(!afterDelete.data.tasks.some(task => String(task.id) === String(taskId)));

console.log(`Verificación completada. Cuenta creada: ${email}`);

// Versión 3: valida migraciones de activity_logs.

// Versión 4: valida migraciones completas de tablas antiguas.

// Versión 5: valida IDs numéricos autoincrementales.

// Versión 6: normaliza tipos de ID devueltos por LibSQL.

// Versión 7: usa códigos de materia únicos en cada ejecución.

// Versión 8: incluye diagnóstico del filtro de tareas.

// Versión 9: compara consulta filtrada contra la consulta completa.

// Versión 10: valida IDs de texto para tareas y estados.

// Versión 11: contempla propagación de lecturas entre funciones serverless.

// Versión 12: usa el ID real devuelto por RETURNING.
