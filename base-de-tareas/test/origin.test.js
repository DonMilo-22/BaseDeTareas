import { beforeAll, describe, expect, it, vi } from 'vitest';

let requireSameOrigin;

beforeAll(async () => {
  process.env.NODE_ENV = 'production';
  process.env.TURSO_DATABASE_URL = 'libsql://example.turso.io';
  process.env.JWT_SECRET = 'origin-test-secret-with-more-than-thirty-two-characters';
  process.env.APP_URL = 'https://basedetareas.vercel.app';
  vi.resetModules();
  ({ requireSameOrigin } = await import('../src/server/middleware.js'));
});

describe('protección de origen', () => {
  it('acepta el dominio de producción y el host real de un preview', () => {
    const next = vi.fn();
    requireSameOrigin({ method: 'POST', protocol: 'https', headers: { origin: 'https://basedetareas.vercel.app', host: 'basedetareas.vercel.app', 'x-forwarded-proto': 'https' } }, {}, next);
    requireSameOrigin({ method: 'POST', protocol: 'https', headers: { origin: 'https://preview.vercel.app', host: 'preview.vercel.app', 'x-forwarded-proto': 'https' } }, {}, next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('rechaza un origen externo', () => {
    expect(() => requireSameOrigin({ method: 'POST', protocol: 'https', headers: { origin: 'https://evil.example', host: 'basedetareas.vercel.app', 'x-forwarded-proto': 'https' } }, {}, vi.fn())).toThrow(/Origen/);
  });
});
