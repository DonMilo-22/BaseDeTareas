import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const baseUrl = (process.env.BASE_URL || '').replace(/\/$/, '');
assert(baseUrl, 'Falta BASE_URL');
let cookie = '';

async function request(path, { expected, ...options } = {}) {
  const response = await fetch(baseUrl + path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers || {}),
    },
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';', 1)[0];
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();
  if (expected) assert.equal(response.status, expected, `${options.method || 'GET'} ${path}: ${JSON.stringify(data)}`);
  else assert(response.ok, `${options.method || 'GET'} ${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

let lastError;
for (let attempt = 0; attempt < 12; attempt += 1) {
  try {
    const health = await request('/api/health');
    assert.equal(health.ok, true);
    lastError = null;
    break;
  } catch (error) {
    lastError = error;
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}
if (lastError) throw lastError;

const html = await request('/');
assert.match(html, /id="auth-screen"/);
assert.match(html, /id="app-shell"/);
await request('/css/app.css');
await request('/js/app.js');

const suffix = randomUUID().replaceAll('-', '').slice(0, 16);
const account = {
  name: 'Verificación automática',
  email: `smoke-${suffix}@example.com`,
  password: `Prueba-${suffix}!`,
  timezone: 'America/Mexico_City',
};

const registered = await request('/api/auth/register', { method: 'POST', body: JSON.stringify(account), expected: 201 });
assert.equal(registered.user.email, account.email);
const me = await request('/api/auth/me');
assert.equal(me.user.id, registered.user.id);
assert.deepEqual(me.groups, []);
await request('/api/auth/me', {
  method: 'PATCH',
  body: JSON.stringify({ name: 'Verificación automática OK', theme: 'light' }),
});
await request('/api/auth/logout', { method: 'POST', expected: 204 });
cookie = '';
await request('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: account.email, password: account.password }),
});
await request('/api/auth/me', { method: 'DELETE', expected: 204 });

console.log('Verificación de producción completada sin dejar datos temporales.');
