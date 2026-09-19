import { test, expect } from '@playwright/test';

test('flujo principal de escritorio', async ({ page }) => {
  const suffix = Date.now();
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Continúa donde te quedaste' })).toBeVisible();
  await page.getByRole('tab', { name: 'Crear cuenta' }).click();
  await page.locator('#register-form input[name="name"]').fill('Prueba E2E');
  await page.locator('#register-form input[name="email"]').fill(`e2e-${suffix}@example.com`);
  await page.locator('#register-form input[name="password"]').fill('Prueba-Segura-123');
  await page.getByRole('button', { name: 'Crear cuenta' }).last().click();

  await expect(page.getByRole('heading', { name: '¿Cómo vas a usar Base de Tareas?' })).toBeVisible();
  await page.getByRole('button', { name: /Crear un grupo/ }).click();
  await page.locator('#group-create-form input[name="name"]').fill(`Grupo ${suffix}`);
  await page.locator('#group-create-form button[value="default"]').click();

  await expect(page.getByRole('heading', { name: /Hola, Prueba/ })).toBeVisible();
  await page.getByRole('link', { name: /Materias/ }).click();
  await page.getByRole('button', { name: /Nueva materia/ }).click();
  await page.locator('#class-form input[name="name"]').fill('Arquitectura de Computadoras');
  await page.locator('#class-form textarea[name="topics"]').fill('Unidad 1\nUnidad 2');
  await page.locator('#class-form button[value="default"]').click();
  await expect(page.getByRole('heading', { name: 'Arquitectura de Computadoras' })).toBeVisible();

  await page.locator('#quick-add').click();
  await page.locator('#task-form input[name="title"]').fill('Reporte de memoria');
  await page.locator('#task-form textarea[name="description"]').fill('Comparar el consumo antes y después.');
  await page.locator('#task-form textarea[name="subtasks"]').fill('Tomar capturas\nRedactar conclusión');
  await page.locator('#task-form input[name="due_at"]').fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  await page.locator('#task-form button[value="default"]').click();

  await page.getByRole('link', { name: /Tareas/ }).click();
  await expect(page.getByText('Reporte de memoria')).toBeVisible();
  await page.getByText('Reporte de memoria').click();
  await expect(page.getByRole('heading', { name: 'Reporte de memoria' })).toBeVisible();
  await expect(page.getByText('Tomar capturas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('la interfaz móvil no tiene desbordamiento horizontal', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Validación exclusiva de móvil');
  await page.goto('/');
  const metrics = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
  await expect(page.getByRole('heading', { name: 'Continúa donde te quedaste' })).toBeVisible();
});
