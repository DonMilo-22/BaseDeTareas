import { describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.TURSO_DATABASE_URL = 'file::memory:';
process.env.JWT_SECRET = 'test-secret-with-more-than-thirty-two-characters';

const { qstashErrorMessage } = await import('../src/server/qstash.js');

describe('mensajes seguros de QStash', () => {
  it('explica errores de autorización sin revelar credenciales', () => {
    expect(qstashErrorMessage({ status: 401, message: 'unauthorized' })).toContain('QSTASH_TOKEN');
  });

  it('explica errores de URL y oculta tokens incluidos por el proveedor', () => {
    expect(qstashErrorMessage({ status: 400, message: 'invalid destination url' })).toContain('APP_URL');
    expect(qstashErrorMessage(new Error('Bearer secreto-super-privado'))).not.toContain('secreto-super-privado');
  });
});
