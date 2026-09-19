import { createClient } from '@libsql/client';
import { config } from './config.js';

let client;

export function getDb() {
  if (!client) client = createClient({ url: config.databaseUrl, authToken: config.databaseAuthToken });
  return client;
}

export async function checkDatabase() {
  const result = await getDb().execute('SELECT 1 AS ok');
  return Number(result.rows[0]?.ok) === 1;
}

export async function transaction(statements) {
  return getDb().batch(statements, 'write');
}

export function resetDbForTests() {
  if (client) client.close();
  client = undefined;
}
