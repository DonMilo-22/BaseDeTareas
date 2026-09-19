import { readFile } from 'node:fs/promises';
import { getDb } from '../src/server/db.js';

const schema = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8');
await getDb().executeMultiple(schema);

const result = await getDb().execute('SELECT version, name, applied_at FROM schema_migrations ORDER BY version');
console.log(`Migración completada (${result.rows.length} versiones).`);
for (const row of result.rows) console.log(`- ${row.version}: ${row.name}`);
