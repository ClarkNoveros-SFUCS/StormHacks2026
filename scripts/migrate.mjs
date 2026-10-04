#!/usr/bin/env node
// Applies db/migrations/*.sql in name order and records each in schema_migrations.
// Usage: npm run db:migrate            apply pending migrations
//        npm run db:migrate -- --status  list applied and pending, change nothing
//
// Each file runs in its own transaction. Create continuous aggregates `WITH NO DATA`
// so they can run inside one.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

const root = path.resolve(import.meta.dirname, '..');
const migrationsDir = path.join(root, 'db', 'migrations');

for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(path.join(root, file)); // never overrides variables already set
  } catch {}
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Put it in .env.local (see .env.example).');
  process.exit(1);
}

// max: 1 keeps every query on one connection, so the advisory lock below holds throughout.
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const LOCK_ID = 727_001; // arbitrary; stops two teammates migrating the shared DB at once

try {
  await sql`select pg_advisory_lock(${LOCK_ID})`;
  await sql`
    create table if not exists schema_migrations (
      name        text primary key,
      applied_at  timestamptz not null default now()
    )`;

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  const applied = new Set((await sql`select name from schema_migrations`).map((r) => r.name));
  const pending = files.filter((f) => !applied.has(f));

  if (process.argv.includes('--status')) {
    for (const f of files) console.log(`${applied.has(f) ? 'applied' : 'pending'}  ${f}`);
  } else if (pending.length === 0) {
    console.log('Database is up to date.');
  } else {
    for (const name of pending) {
      const body = await readFile(path.join(migrationsDir, name), 'utf8');
      process.stdout.write(`Applying ${name} … `);
      await sql.begin(async (tx) => {
        await tx.unsafe(body).simple(); // simple protocol allows many statements per file
        await tx`insert into schema_migrations (name) values (${name})`;
      });
      console.log('done');
    }
    console.log(`Applied ${pending.length} migration(s).`);
  }
} catch (err) {
  console.error('\nMigration failed:', err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
