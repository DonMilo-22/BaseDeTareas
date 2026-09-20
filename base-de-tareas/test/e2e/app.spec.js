import { test, expect } from '@playwright/test';

async function verifyRegistrationEmail(page) {
  await expect(page.getByRole('heading', { name: 'Confirma que eres tú' })).toBeVisible();
  await expect(page.locator('#register-code-form input[name="code"]')).toHaveValue(/^\d{6}$/);
  await page.getByRole('button', { name: 'Verificar y crear cuenta' }).click();
}

test('flujo principal de escritorio', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Validación exclusiva de escritorio');
  const suffix = Date.now();
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Continúa donde te quedaste' })).toBeVisible();
  await page.getByRole('tab', { name: 'Crear cuenta' }).click();
  await page.locator('#register-form input[name="name"]').fill('Prueba E2E');
  await page.locator('#register-form input[name="email"]').fill(`e2e-${suffix}@mail.test`);
  await page.locator('#register-form input[name="password"]').fill('Prueba-Segura-123');
  await page.getByRole('button', { name: 'Crear cuenta' }).last().click();
  await verifyRegistrationEmail(page);

  await expect(page.getByRole('heading', { name: '¿Cómo vas a usar Base de Tareas?' })).toBeVisible();
  await page.getByRole('button', { name: /Crear un grupo/ }).click();
  await page.locator('#group-create-form input[name="name"]').fill(`Grupo ${suffix}`);
  await page.locator('#group-create-form button[value="default"]').click();

  await expect(page.getByRole('heading', { name: /Hola, Prueba/ })).toBeVisible();
  await page.getByRole('link', { name: /Materias/ }).click();
  await page.getByRole('button', { name: /Nueva materia/ }).click();
  await page.locator('#class-form input[name="name"]').fill('Arquitectura de Computadoras');
  await page.locator('#class-form input[name="teacher"]').fill('Dra. Rivera');
  await page.locator('#class-form input[name="room"]').fill('Laboratorio 2');
  await page.locator('#class-form textarea[name="topics"]').fill('Unidad 1\nUnidad 2');
  await page.locator('#class-form button[value="default"]').click();
  await expect(page.getByRole('heading', { name: 'Arquitectura de Computadoras' })).toBeVisible();
  await page.locator('.class-card-toggle').click();
  await expect(page.locator('.class-card.expanded')).toBeVisible();
  await expect(page.locator('.class-expanded')).toContainText('Dra. Rivera');
  await expect(page.locator('.class-topic-placeholder')).toContainText('Elige una unidad');

  await page.locator('#quick-add').click();
  await page.locator('#task-form input[name="title"]').fill('Reporte de memoria');
  await page.locator('#task-form select[name="topic_id"]').selectOption({ label: 'Unidad 1' });
  await page.locator('#task-form textarea[name="description"]').fill('Comparar el consumo antes y después.');
  await page.locator('#task-form textarea[name="subtasks"]').fill('Tomar capturas\nRedactar conclusión');
  await page.locator('#task-form input[name="due_at"]').fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  await page.locator('#task-form button[value="default"]').click();

  await page.locator('.class-topic-button', { hasText: 'Unidad 1' }).click();
  await expect(page.locator('.class-topic-tasks').getByText('Reporte de memoria')).toBeVisible();

  await page.getByRole('link', { name: /Tareas/ }).click();
  await expect(page.getByText('Reporte de memoria')).toBeVisible();
  await page.getByText('Reporte de memoria').click();
  await expect(page.getByRole('heading', { name: 'Reporte de memoria' })).toBeVisible();
  await expect(page.getByText('Tomar capturas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('la experiencia móvil permite recorrer y operar todas las vistas', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Validación exclusiva de móvil');
  const suffix = Date.now();
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const calendarDate = new Date(now.getFullYear(), now.getMonth(), Math.min(now.getDate() + 1, lastDay), 12);
  const calendarValue = calendarDate.toISOString().slice(0, 16);
  const assertNoOverflow = async () => {
    const metrics = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
  };

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Continúa donde te quedaste' })).toBeVisible();
  await assertNoOverflow();
  await page.getByRole('tab', { name: 'Crear cuenta' }).click();
  await page.locator('#register-form input[name="name"]').fill('Prueba Móvil');
  await page.locator('#register-form input[name="email"]').fill(`mobile-${suffix}@mail.test`);
  await page.locator('#register-form input[name="password"]').fill('Prueba-Segura-123');
  await page.getByRole('button', { name: 'Crear cuenta' }).last().click();
  await verifyRegistrationEmail(page);

  await page.getByRole('button', { name: /Crear un grupo/ }).click();
  await expect(page.locator('#group-create-dialog')).toBeVisible();
  await page.locator('#group-create-form input[name="name"]').fill(`Móvil ${suffix}`);
  await page.locator('#group-create-form button[value="default"]').click();
  await expect(page.getByRole('heading', { name: /Hola, Prueba/ })).toBeVisible();
  await assertNoOverflow();

  await page.locator('#mobile-menu').click();
  await expect(page.locator('#sidebar')).toBeVisible();
  await page.locator('#mobile-sidebar-close').click();

  await page.locator('#mobile-menu').click();
  await page.locator('#sidebar a[href="#classes"]').click();
  await page.getByRole('button', { name: /Nueva materia/ }).click();
  await page.locator('#class-form input[name="name"]').fill('Redes móviles');
  await page.locator('#class-form input[name="schedule"]').fill('Martes · 12:00');
  await page.locator('#class-form textarea[name="topics"]').fill('Unidad móvil\nProyecto final');
  await page.locator('#class-form button[value="default"]').click();
  await expect(page.getByRole('heading', { name: 'Redes móviles' })).toBeVisible();
  await page.locator('.class-card-toggle').click();
  await expect(page.locator('.class-card.expanded')).toBeVisible();
  await expect(page.locator('.class-topic-placeholder')).toContainText('Elige una unidad');
  await assertNoOverflow();

  await page.locator('#quick-add').click();
  await page.locator('#task-form input[name="title"]').fill('Prueba responsiva');
  await page.locator('#task-form select[name="topic_id"]').selectOption({ label: 'Unidad móvil' });
  await page.locator('#task-form input[name="due_at"]').fill(calendarValue);
  await page.locator('#task-form button[value="default"]').click();
  await page.locator('.class-topic-button', { hasText: 'Unidad móvil' }).click();
  await expect(page.locator('.class-topic-tasks').getByText('Prueba responsiva')).toBeVisible();
  await assertNoOverflow();

  await page.locator('.mobile-nav a[href="#announcements"]').click();
  await page.getByRole('button', { name: /Nuevo anuncio/ }).click();
  await page.locator('#announcement-form textarea[name="body"]').fill('Llevar libreta mañana');
  await page.locator('#announcement-form input[name="event_at"]').fill(calendarValue);
  await page.locator('#announcement-form button[type="submit"]').click();
  await expect(page.getByText('Llevar libreta mañana')).toBeVisible();
  await assertNoOverflow();

  await page.locator('.mobile-nav a[href="#calendar"]').click();
  await expect(page.locator('.mobile-agenda')).toBeVisible();
  await expect(page.locator('.calendar-grid')).toBeHidden();
  await expect(page.locator('.mobile-agenda').getByText('Prueba responsiva')).toBeVisible();
  await expect(page.locator('.mobile-agenda').getByText('Llevar libreta mañana')).toBeVisible();
  await assertNoOverflow();

  await page.locator('.mobile-nav a[href="#tasks"]').click();
  await page.getByText('Prueba responsiva').click();
  await expect(page.locator('#task-detail-dialog')).toBeVisible();
  const dialog = await page.locator('#task-detail-dialog').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, viewport: window.innerHeight };
  });
  expect(dialog.top).toBeGreaterThanOrEqual(0);
  expect(dialog.bottom).toBeLessThanOrEqual(dialog.viewport + 1);
  await page.locator('[data-detail-action="close"]').click();

  await page.locator('.mobile-nav a[href="#settings"]').click();
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Notificaciones push/ })).toBeVisible();
  await assertNoOverflow();
});
