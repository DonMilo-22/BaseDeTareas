import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import makeFetchCookie from 'fetch-cookie';
import { readFile } from 'node:fs/promises';

process.env.NODE_ENV = 'test';
process.env.TURSO_DATABASE_URL = 'file::memory:';
process.env.JWT_SECRET = 'frontend-secret-with-more-than-thirty-two-characters';
process.env.APP_URL = 'http://localhost:3000';

let server;
let window;

async function waitFor(check, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('La interfaz no alcanzó el estado esperado.');
}

beforeAll(async () => {
  const { getDb } = await import('../src/server/db.js');
  const schema = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8');
  await getDb().executeMultiple(schema);
  const { default: app } = await import('../src/server/app.js');
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  window = new Window({ url: `${baseUrl}/` });
  window.document.write(await readFile(new URL('../public/index.html', import.meta.url), 'utf8'));
  const cookieFetch = makeFetchCookie(globalThis.fetch);
  const relativeFetch = (input, init) => cookieFetch(new URL(input, baseUrl).href, init);
  class TestFormData {
    constructor(form) {
      this.values = [...form.elements]
        .filter(element => element.name && !element.disabled && (element.type !== 'checkbox' || element.checked))
        .map(element => [element.name, element.value]);
    }
    get(name) { return this.values.find(([key]) => key === name)?.[1] ?? null; }
    entries() { return this.values[Symbol.iterator](); }
    [Symbol.iterator]() { return this.entries(); }
  }

  for (const [key, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    location: window.location,
    history: window.history,
    localStorage: window.localStorage,
    matchMedia: window.matchMedia.bind(window),
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window),
    HTMLElement: window.HTMLElement,
    HTMLDialogElement: window.HTMLDialogElement,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    FormData: TestFormData,
    fetch: relativeFetch,
    confirm: () => true,
  })) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });

  await import('../public/js/app.js');
});

afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (window) await window.happyDOM.close();
});

describe('interfaz v2', () => {
  it('completa registro, onboarding y carga el dashboard sin error de JavaScript', async () => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const calendarDate = new Date(now.getFullYear(), now.getMonth(), Math.min(now.getDate() + 1, lastDay), 12);
    const calendarValue = calendarDate.toISOString().slice(0, 16);
    await waitFor(() => !document.getElementById('auth-screen').hidden);
    document.querySelector('[data-auth-tab="register"]').click();
    const register = document.getElementById('register-form');
    register.querySelector('[name="name"]').value = 'Interfaz Prueba';
    register.querySelector('[name="email"]').value = `frontend-${Date.now()}@mail.test`;
    register.querySelector('[name="password"]').value = 'Contrasena-Segura-123';
    register.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => !document.getElementById('register-code-form').hidden);
    const codeForm = document.getElementById('register-code-form');
    expect(codeForm.querySelector('[name="code"]').value).toHaveLength(6);
    codeForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => !document.getElementById('onboarding-screen').hidden);
    document.querySelector('[data-open-dialog="group-create-dialog"]').click();
    const group = document.getElementById('group-create-form');
    group.querySelector('[name="name"]').value = 'Grupo de interfaz';
    group.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => !document.getElementById('app-shell').hidden);
    await waitFor(() => document.getElementById('view').textContent.includes('Próximas entregas'));
    expect(document.getElementById('current-group-name').textContent).toBe('Grupo de interfaz');
    expect(document.getElementById('view').textContent).toContain('Todo despejado');

    document.querySelector('[data-view="classes"]').click();
    await waitFor(() => document.getElementById('view').textContent.includes('Materias'));
    document.querySelector('[data-action="new-class"]').click();
    const classForm = document.getElementById('class-form');
    classForm.querySelector('[name="name"]').value = 'Arquitectura';
    classForm.querySelector('[name="code"]').value = 'AC-01';
    classForm.querySelector('[name="teacher"]').value = 'Dra. Rivera';
    classForm.querySelector('[name="schedule"]').value = 'Lun y mié · 10:00';
    classForm.querySelector('[name="room"]').value = 'Laboratorio 2';
    classForm.querySelector('[name="color"]').value = '#0f766e';
    classForm.querySelector('[name="topics"]').value = 'Unidad 1\nUnidad 2';
    classForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => !document.getElementById('class-dialog').open && document.getElementById('view').textContent.includes('Arquitectura'));

    document.querySelector('.class-card-toggle').click();
    await waitFor(() => document.querySelector('.class-card.expanded'));
    expect(document.querySelector('.class-expanded').textContent).toContain('Dra. Rivera');
    expect(document.querySelector('.class-expanded').textContent).toContain('Laboratorio 2');
    expect(document.querySelector('.class-topic-placeholder').textContent).toContain('Elige una unidad');
    expect(document.querySelector('.class-topic-tasks .task-row')).toBeNull();

    document.getElementById('quick-add').click();
    const taskForm = document.getElementById('task-form');
    taskForm.querySelector('[name="title"]').value = 'Reporte final';
    taskForm.querySelector('[name="topic_id"]').value = [...taskForm.querySelector('[name="topic_id"]').options].find(option => option.value)?.value;
    taskForm.querySelector('[name="due_at"]').value = calendarValue;
    taskForm.querySelector('[name="subtasks"]').value = 'Investigar\nRedactar';
    taskForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => !document.getElementById('task-dialog').open && document.querySelector('.class-topic-button'));

    document.querySelector('.class-topic-button').click();
    await waitFor(() => document.querySelector('.class-topic-tasks')?.textContent.includes('Reporte final'));
    expect(document.querySelector('.class-topic-button').getAttribute('aria-pressed')).toBe('true');
    document.querySelector('.class-topic-button').click();
    expect(document.querySelector('.class-topic-placeholder').textContent).toContain('permanecerán ocultas');

    document.querySelector('[data-view="tasks"]').click();
    await waitFor(() => document.getElementById('view').textContent.includes('Reporte final'));
    document.querySelector('[data-task-id]').click();
    await waitFor(() => document.getElementById('task-detail-content').textContent.includes('Investigar'));
    expect(document.getElementById('task-detail-content').textContent).toContain('Reporte final');

    document.querySelector('[data-detail-action="close"]').click();
    document.querySelector('[data-view="announcements"]').click();
    await waitFor(() => document.getElementById('view').textContent.includes('Anuncios'));
    document.querySelector('[data-action="new-announcement"]').click();
    const announcementForm = document.getElementById('announcement-form');
    announcementForm.querySelector('[name="body"]').value = 'El martes traer libreta y lápiz.';
    announcementForm.querySelector('[name="event_at"]').value = calendarValue;
    announcementForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => !document.getElementById('announcement-dialog').open && document.getElementById('view').textContent.includes('traer libreta'));

    document.querySelector('[data-view="calendar"]').click();
    await waitFor(() => document.getElementById('view').textContent.includes('Aviso · El martes traer libreta'));
    expect(document.querySelector('.mobile-agenda').textContent).toContain('Reporte final');
    expect(document.querySelector('.mobile-agenda').textContent).toContain('El martes traer libreta y lápiz.');
    expect(document.querySelector('.mobile-nav a[href="#classes"]')).not.toBeNull();
    expect(document.querySelector('.mobile-nav a[href="#calendar"] small').textContent).toBe('Calendario');

    document.querySelector('[data-view="settings"]').click();
    await waitFor(() => document.getElementById('view').textContent.includes('Notificaciones push'));
    expect(document.querySelector('.push-settings').textContent).toContain('No compatible');
  });

  it('includes the actor name in activity sentences', async () => {
    const { activitySentence } = await import('../public/js/ui.js');
    expect(activitySentence({ user_name: 'Emiliano', summary: 'Completó la tarea Investigación.' }))
      .toBe('Emiliano completó la tarea Investigación.');
  });

  it('interprets SQLite timestamps as UTC without changing zoned dates', async () => {
    const { dateTime, parseDate } = await import('../public/js/ui.js');
    expect(parseDate('2026-09-19 14:12:00').toISOString()).toBe('2026-09-19T14:12:00.000Z');
    expect(parseDate('2026-09-19T14:12:00.000Z').toISOString()).toBe('2026-09-19T14:12:00.000Z');
    expect(parseDate('2026-09-19T08:12:00-06:00').toISOString()).toBe('2026-09-19T14:12:00.000Z');
    expect(dateTime('2026-09-19 14:12:00', { timeZone: 'America/Mexico_City' })).toContain('8:12');
  });
});
