import { Pool } from '@neondatabase/serverless';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente. Configure a connection string pooled do Neon.');
const dir = path.dirname(fileURLToPath(import.meta.url));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const schema = await readFile(path.join(dir, '../db/schema.sql'), 'utf8');
  for (const statement of schema.split(';').map((sql) => sql.trim()).filter(Boolean)) {
    await pool.query(statement);
  }
  console.log('Schema aplicado com sucesso.');
} finally {
  await pool.end();
}
