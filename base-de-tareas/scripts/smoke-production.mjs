import assert from 'node:assert/strict';

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

await request('/api/auth/me', { expected: 401 });
await request('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: 'smoke-inexistente@example.com', password: 'Prueba-inexistente-123' }),
  expected: 401,
});
const recovery = await request('/api/auth/password/forgot', {
  method: 'POST',
  body: JSON.stringify({ email: 'smoke-inexistente@example.com' }),
  expected: 202,
});
assert.match(recovery.message, /Si existe una cuenta/);

console.log('Verificación pública de producción completada sin crear datos temporales.');
