import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { readFile } from 'node:fs/promises';

process.env.NODE_ENV = 'test';
process.env.TURSO_DATABASE_URL = 'file::memory:';
process.env.JWT_SECRET = 'test-secret-with-more-than-thirty-two-characters';
process.env.APP_URL = 'http://localhost:3000';
process.env.CRON_SECRET = 'test-cron-secret';
process.env.EMAIL_RECIPIENT_OVERRIDE = 'pruebas@correo.com';
process.env.VAPID_PUBLIC_KEY = 'BCKk69OU41zHmKeoPUKuVLqMyk-pFliL1EsLAU1_8VAqBTDxs6FerxqzSWdT75b9gYYODSmbOsTNk5YiP3teJ_Y';
process.env.VAPID_PRIVATE_KEY = '76vT2Uwh9fejouMoPP7-jd4lHNR67un-yp0GcJYk9Do';

let app;
let db;
let admin;
let member;
let groupId;
let secondGroupId;
let adminUserId;
let classId;
let taskId;
let subtaskId;
let topicId;
let commentId;
let reminderId;

async function registerVerified(agent, account) {
  const started = await agent.post('/api/auth/register').send(account).expect(202);
  expect(started.body.verification_required).toBe(true);
  const beforeVerification = await db.execute({
    sql: 'SELECT id FROM users WHERE email = ? COLLATE NOCASE',
    args: [account.email],
  });
  expect(beforeVerification.rows).toHaveLength(0);
  return agent.post('/api/auth/register/verify').send({
    email: account.email,
    code: started.body.test_code,
  }).expect(201);
}

beforeAll(async () => {
  ({ default: app } = await import('../src/server/app.js'));
  db = (await import('../src/server/db.js')).getDb();
  const schema = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8');
  await db.executeMultiple(schema);
  admin = request.agent(app);
  member = request.agent(app);
});

describe('Base de Tareas v2 API', () => {
  it('reports a healthy database', async () => {
    const response = await request(app).get('/api/health').expect(200);
    expect(response.body).toMatchObject({ ok: true, version: '2.5.0' });
  });

  it('verifies email before registering users and never accepts a requested role', async () => {
    const registeredAdmin = await registerVerified(admin, { name: 'Administradora', email: 'admin@example.com', password: 'Segura-1234', role: 'admin' });
    adminUserId = registeredAdmin.body.user.id;
    await registerVerified(member, { name: 'Estudiante', email: 'member@example.com', password: 'Segura-5678' });
    const me = await admin.get('/api/auth/me').expect(200);
    expect(me.body.groups).toEqual([]);
    expect(me.body.user).not.toHaveProperty('password_hash');
  });

  it('rejects incorrect verification codes and enforces the resend cooldown', async () => {
    const account = { name: 'Cuenta pendiente', email: 'pending@example.com', password: 'Segura-9012' };
    const started = await request(app).post('/api/auth/register').send(account).expect(202);
    const wrongCode = started.body.test_code === '000000' ? '000001' : '000000';
    const incorrect = await request(app).post('/api/auth/register/verify').send({ email: account.email, code: wrongCode }).expect(400);
    expect(incorrect.body.error.code).toBe('INVALID_CODE');
    const cooldown = await request(app).post('/api/auth/register/resend').send({ email: account.email }).expect(429);
    expect(cooldown.body.error.code).toBe('CODE_COOLDOWN');
    for (let attempt = 2; attempt < 5; attempt += 1) {
      await request(app).post('/api/auth/register/verify').send({ email: account.email, code: wrongCode }).expect(400);
    }
    const locked = await request(app).post('/api/auth/register/verify').send({ email: account.email, code: wrongCode }).expect(429);
    expect(locked.body.error.code).toBe('CODE_ATTEMPTS_EXCEEDED');
    await request(app).post('/api/auth/register/verify').send({ email: account.email, code: started.body.test_code }).expect(400);
  });

  it('rejects and removes expired verification codes', async () => {
    const account = { name: 'Código vencido', email: 'expired@example.com', password: 'Segura-3456' };
    const started = await request(app).post('/api/auth/register').send(account).expect(202);
    await db.execute({
      sql: 'UPDATE auth_codes SET expires_at = ? WHERE email = ? AND purpose = ?',
      args: [new Date(Date.now() - 1000).toISOString(), account.email, 'registration'],
    });
    const response = await request(app).post('/api/auth/register/verify').send({
      email: account.email,
      code: started.body.test_code,
    }).expect(400);
    expect(response.body.error.code).toBe('CODE_EXPIRED');
  });

  it('restores a password with a temporary code and invalidates the previous password', async () => {
    const requested = await request(app).post('/api/auth/password/forgot').send({ email: 'member@example.com' }).expect(202);
    await request(app).post('/api/auth/password/reset').send({
      email: 'member@example.com',
      code: requested.body.test_code,
      password: 'Nueva-Segura-7890',
    }).expect(200);
    await request(app).post('/api/auth/login').send({ email: 'member@example.com', password: 'Segura-5678' }).expect(401);
    await member.post('/api/auth/login').send({ email: 'member@example.com', password: 'Nueva-Segura-7890' }).expect(200);
  });

  it('does not reveal whether an email exists during password recovery', async () => {
    const response = await request(app).post('/api/auth/password/forgot').send({ email: 'nadie@example.com' }).expect(202);
    expect(response.body.message).toContain('Si existe una cuenta');
    expect(response.body).not.toHaveProperty('test_code');
  });

  it('stores profile photos and personal colors', async () => {
    const avatar = 'data:image/jpeg;base64,aGVsbG8=';
    const updated = await admin.patch('/api/auth/me').send({
      avatar_url: avatar,
      avatar_color: '#0f766e',
      accent_color: '#db2777',
    }).expect(200);
    expect(updated.body.user).toMatchObject({ avatar_url: avatar, avatar_color: '#0f766e', accent_color: '#db2777' });
    const me = await admin.get('/api/auth/me').expect(200);
    expect(me.body.user.accent_color).toBe('#db2777');
  });

  it('registers and tests a Web Push subscription without exposing its keys', async () => {
    const config = await admin.get('/api/push/config').expect(200);
    expect(config.body).toMatchObject({ configured: true, devices: 0 });
    expect(config.body.public_key).toBe(process.env.VAPID_PUBLIC_KEY);
    await admin.post('/api/push/subscriptions').send({
      endpoint: 'https://push.example.test/admin-device',
      keys: {
        p256dh: 'test-p256dh-key-with-enough-length',
        auth: 'test-auth-key',
      },
    }).expect(201);
    const active = await admin.get('/api/push/config').expect(200);
    expect(active.body.devices).toBe(1);
    expect(active.body).not.toHaveProperty('subscriptions');
    const testPush = await admin.post('/api/push/test').expect(200);
    expect(testPush.body).toMatchObject({ attempted: 1, sent: 1, failed: 0 });
  });

  it('keeps prefixed IDs from the previous production app usable', async () => {
    const legacyGroupId = 'grp_productionlegacy';
    const legacyClassId = 'cls_productionlegacy';
    const legacyTaskId = 'tsk_productionlegacy';
    await db.batch([
      {
        sql: `INSERT INTO groups (id, name, description, join_code, created_by)
              VALUES (?, 'Grupo heredado', '', 'LEGACY01', ?)`,
        args: [legacyGroupId, adminUserId],
      },
      {
        sql: `INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'admin')`,
        args: [legacyGroupId, adminUserId],
      },
      {
        sql: `INSERT INTO classes (id, group_id, name, created_by)
              VALUES (?, ?, 'Materia heredada', ?)`,
        args: [legacyClassId, legacyGroupId, adminUserId],
      },
      {
        sql: `INSERT INTO tasks
              (id, group_id, class_id, title, due_at, created_by, updated_by)
              VALUES (?, ?, ?, 'Tarea heredada', ?, ?, ?)`,
        args: [legacyTaskId, legacyGroupId, legacyClassId, new Date(Date.now() + 90 * 86400000).toISOString(), adminUserId, adminUserId],
      },
    ], 'write');

    const dashboard = await admin.get(`/api/groups/${legacyGroupId}/dashboard`).expect(200);
    expect(Number(dashboard.body.summary.total)).toBe(1);
    const detail = await admin.get(`/api/groups/${legacyGroupId}/tasks/${legacyTaskId}`).expect(200);
    expect(detail.body.task.title).toBe('Tarea heredada');
  });

  it('creates a group and makes only its creator admin', async () => {
    const created = await admin.post('/api/groups').send({ name: 'ISMA-5', description: 'Grupo de prueba', semester_name: 'Ago-Ene 2026' }).expect(201);
    groupId = created.body.group.id;
    expect(created.body.group.role).toBe('admin');
    const joined = await member.post('/api/groups/join').send({ code: created.body.group.join_code }).expect(201);
    expect(joined.body.group.role).toBe('member');
  });

  it('enforces manager permissions and lets admins promote members', async () => {
    const forbiddenClass = await member.post(`/api/groups/${groupId}/classes`).send({ name: 'Redes' }).expect(403);
    expect(forbiddenClass.body.error.code).toBe('FORBIDDEN');
    const members = await admin.get(`/api/groups/${groupId}/members`).expect(200);
    const student = members.body.members.find(item => item.name === 'Estudiante');
    expect(members.body.members.find(item => item.name === 'Administradora').id).toBe(adminUserId);
    expect(student).not.toHaveProperty('email');
    await admin.patch(`/api/groups/${groupId}/members/${student.id}`).send({ role: 'manager' }).expect(200);
    await member.patch(`/api/groups/${groupId}/members/${adminUserId}`).send({ role: 'member' }).expect(403);
    const lastAdmin = await admin.patch(`/api/groups/${groupId}/members/${adminUserId}`).send({ role: 'member' }).expect(409);
    expect(lastAdmin.body.error.code).toBe('LAST_ADMIN');
  });

  it('keeps classes and permissions isolated between groups', async () => {
    const second = await member.post('/api/groups').send({
      name: 'Grupo privado',
      description: 'No visible para el otro grupo',
      semester_name: 'Ago-Ene 2026',
    }).expect(201);
    secondGroupId = second.body.group.id;
    await admin.get(`/api/groups/${secondGroupId}/classes`).expect(404);
    await member.post(`/api/groups/${secondGroupId}/classes`).send({
      name: 'Materia privada',
      code: 'PRIV-1',
      topics: ['Tema privado'],
    }).expect(201);
    const firstGroupClasses = await member.get(`/api/groups/${groupId}/classes`).expect(200);
    expect(firstGroupClasses.body.classes.some(item => item.name === 'Materia privada')).toBe(false);
  });

  it('creates a class with topics and a task with subtasks', async () => {
    const cls = await member.post(`/api/groups/${groupId}/classes`).send({
      name: 'Redes', code: 'RC-01', color: '#2563eb', topics: ['Unidad 1', 'Unidad 2'],
    }).expect(201);
    classId = cls.body.class.id;
    const classes = await admin.get(`/api/groups/${groupId}/classes`).expect(200);
    topicId = classes.body.classes[0].topics[0].id;
    const task = await member.post(`/api/groups/${groupId}/tasks`).send({
      class_id: classId,
      topic_id: topicId,
      title: 'Configurar topología',
      description: 'Entregar capturas.',
      due_at: new Date(Date.now() + 2 * 86400000).toISOString(),
      is_important: true,
      subtasks: ['Crear routers', 'Probar conectividad'],
    }).expect(201);
    taskId = task.body.task.id;
    expect(task.body.email_notification).toMatchObject({ attempted: 1, sent: 1, failed: 0 });
    expect(task.body.push_notification).toMatchObject({ attempted: 1, sent: 1, failed: 0 });
    const detail = await admin.get(`/api/groups/${groupId}/tasks/${taskId}`).expect(200);
    expect(detail.body.subtasks).toHaveLength(2);
    subtaskId = detail.body.subtasks[0].id;
  });

  it('tracks personal progress independently', async () => {
    await admin.put(`/api/groups/${groupId}/tasks/${taskId}/completion`).send({ completed: true }).expect(200);
    await admin.put(`/api/groups/${groupId}/tasks/${taskId}/subtasks/${subtaskId}/completion`).send({ completed: true }).expect(200);
    const adminTasks = await admin.get(`/api/groups/${groupId}/tasks?status=completed`).expect(200);
    const memberTasks = await member.get(`/api/groups/${groupId}/tasks?status=pending`).expect(200);
    expect(adminTasks.body.tasks).toHaveLength(1);
    expect(memberTasks.body.tasks).toHaveLength(1);
  });

  it('supports comments and scheduled reminder emails through the test adapter', async () => {
    const comment = await admin.post(`/api/groups/${groupId}/tasks/${taskId}/comments`).send({ body: 'Ya quedó revisada.' }).expect(201);
    commentId = comment.body.comment.id;
    const reminder = await admin.post(`/api/groups/${groupId}/tasks/${taskId}/reminders`).send({ remind_at: new Date(Date.now() + 86400000).toISOString() }).expect(201);
    reminderId = reminder.body.reminder.id;
    expect(reminder.body.reminder.status).toBe('scheduled');
    const detail = await admin.get(`/api/groups/${groupId}/tasks/${taskId}`).expect(200);
    expect(detail.body.comments[0].id).toBe(commentId);
    expect(detail.body.reminders[0].id).toBe(reminderId);
    await admin.delete(`/api/groups/${groupId}/tasks/${taskId}/reminders/${reminderId}`).expect(204);
    const cancelled = await admin.get(`/api/groups/${groupId}/tasks/${taskId}`).expect(200);
    expect(cancelled.body.reminders).toHaveLength(0);
  });

  it('publishes announcements with calendar dates and personal email reminders', async () => {
    const eventAt = new Date(Date.now() + 3 * 86400000).toISOString();
    const remindAt = new Date(Date.now() + 2 * 86400000).toISOString();
    const created = await member.post(`/api/groups/${groupId}/announcements`).send({
      body: 'El martes traer libreta y lápiz.',
      event_at: eventAt,
      remind_at: remindAt,
    }).expect(201);
    expect(created.body.announcement.reminder_status).toBe('scheduled');
    expect(created.body.push_notification).toMatchObject({ attempted: 1, sent: 1, failed: 0 });
    const announcementId = created.body.announcement.id;
    const list = await member.get(`/api/groups/${groupId}/announcements`).expect(200);
    expect(list.body.announcements[0]).toMatchObject({ id: announcementId, event_at: eventAt });
    await member.delete(`/api/groups/${groupId}/announcements/${announcementId}/reminder`).expect(204);
    await member.delete(`/api/groups/${groupId}/announcements/${announcementId}`).expect(204);
  });

  it('queues distant reminders and schedules them through the protected cron', async () => {
    const dueAt = new Date(Date.now() + 60 * 86400000).toISOString();
    await member.patch(`/api/groups/${groupId}/tasks/${taskId}`).send({
      class_id: classId,
      topic_id: topicId,
      title: 'Configurar topología',
      description: 'Entregar capturas.',
      due_at: dueAt,
      is_important: true,
      subtasks: ['Crear routers', 'Probar conectividad'],
    }).expect(200);
    const distant = await admin.post(`/api/groups/${groupId}/tasks/${taskId}/reminders`).send({
      remind_at: new Date(Date.now() + 40 * 86400000).toISOString(),
    }).expect(201);
    expect(distant.body.reminder.status).toBe('pending');
    await request(app).get('/api/cron/reminders').expect(401);
    await db.execute({
      sql: `UPDATE reminders SET remind_at = ? WHERE id = ?`,
      args: [new Date(Date.now() + 3 * 86400000).toISOString(), distant.body.reminder.id],
    });
    await member.post(`/api/groups/${groupId}/tasks`).send({
      class_id: classId,
      topic_id: topicId,
      title: 'Entrega urgente',
      description: 'Debe generar recordatorio automático.',
      due_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      is_important: true,
      subtasks: [],
    }).expect(201);
    const cron = await request(app).get('/api/cron/reminders').set('Authorization', 'Bearer test-cron-secret').expect(200);
    expect(cron.body.scheduled).toBe(1);
    expect(cron.body.automatic).toMatchObject({ tasks_due_soon: 1, sent: 1 });
    expect(cron.body.push).toMatchObject({ tasks_due_soon: 1, sent: 1, failed: 0 });
    const repeated = await request(app).get('/api/cron/reminders').set('Authorization', 'Bearer test-cron-secret').expect(200);
    expect(repeated.body.automatic.sent).toBe(0);
    expect(repeated.body.automatic.skipped).toBeGreaterThan(0);
    expect(repeated.body.push.sent).toBe(0);
    expect(repeated.body.push.skipped).toBeGreaterThan(0);
    await admin.delete('/api/push/subscriptions').send({ endpoint: 'https://push.example.test/admin-device' }).expect(204);
  });

  it('rejects unsafe attachment protocols', async () => {
    const response = await member.post(`/api/groups/${groupId}/tasks/${taskId}/attachments`).send({
      name: 'Enlace inseguro',
      url: 'javascript:alert(1)',
    }).expect(400);
    expect(response.body.error.code).toBe('BAD_REQUEST');
  });

  it('exports calendar and CSV data', async () => {
    const csv = await admin.get(`/api/groups/${groupId}/export?format=csv`).expect(200);
    expect(csv.text).toContain('Configurar topología');
    const ics = await admin.get(`/api/groups/${groupId}/export?format=ics`).expect(200);
    expect(ics.text).toContain('BEGIN:VCALENDAR');
  });

  it('moves tasks to trash and restores them', async () => {
    await member.delete(`/api/groups/${groupId}/tasks/${taskId}`).expect(204);
    const trash = await admin.get(`/api/groups/${groupId}/trash`).expect(200);
    expect(trash.body.items.some(item => item.id === taskId)).toBe(true);
    await admin.post(`/api/groups/${groupId}/tasks/${taskId}/restore`).expect(200);
    const tasks = await admin.get(`/api/groups/${groupId}/tasks`).expect(200);
    expect(tasks.body.tasks.some(item => item.id === taskId)).toBe(true);
  });

  it('permanently deletes a task from trash', async () => {
    await member.delete(`/api/groups/${groupId}/tasks/${taskId}`).expect(204);
    await member.delete(`/api/groups/${groupId}/trash/tasks/${taskId}`).expect(204);
    const trash = await member.get(`/api/groups/${groupId}/trash`).expect(200);
    expect(trash.body.items.some(item => item.id === taskId)).toBe(false);
  });

  it('lets a member leave a group while preserving the last administrator', async () => {
    await member.delete(`/api/groups/${groupId}/members/${(await member.get('/api/auth/me')).body.user.id}`).expect(204);
    const members = await admin.get(`/api/groups/${groupId}/members`).expect(200);
    expect(members.body.members.some(item => item.name === 'Estudiante')).toBe(false);
    await admin.delete(`/api/groups/${groupId}/members/${adminUserId}`).expect(409);
  });
});
