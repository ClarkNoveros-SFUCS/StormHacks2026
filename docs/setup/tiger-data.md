# Tiger Data setup (app database)

Used by **every backend feature** (F01 first). Tiger Cloud is managed Postgres with TimescaleDB. One person creates one shared dev service for the team (~10 min) and shares the connection string privately. Never commit it.

## 1. Create the account and service

1. Sign up through the MLH quickstart link: https://mlh.link/tigerdata-quickstart. MLH participants get $1,000 in credits, valid for 30 days.
2. In **Tiger Console** (https://console.tigerdata.com) → **New service**. Pick the region closest to you (or to where the app will be deployed), and keep the default Postgres + TimescaleDB service type.
3. When the wizard finishes, **download the config file right away**. It's the only time the password is shown. It contains the service URL, host, port, database (`tsdb`), user (`tsdbadmin`) and password.

## 2. Connection string

From the config file:

```
postgres://tsdbadmin:<password>@<service-id>.<project-id>.tsdb.cloud.timescale.com:<port>/tsdb?sslmode=require
```

SSL is required. `sslmode=require` is Tiger Cloud's default.

`.env.local`:
```bash
DATABASE_URL="postgres://tsdbadmin:…@….tsdb.cloud.timescale.com:…/tsdb?sslmode=require"
```

**One shared service or one each?** Use one shared dev service for the team: everyone sees the same schema, and F02's seed data works for everyone. Anyone who wants to experiment freely can create their own service and point their `DATABASE_URL` at it.

## 3. Check it works (no app code needed)

With `psql` (macOS: `brew install libpq` and follow its PATH note), or any SQL client such as the Tiger Console SQL editor:

```bash
psql "$DATABASE_URL" -c "select version();"
psql "$DATABASE_URL" -c "select extname, extversion from pg_extension;"     # timescaledb should be listed
psql "$DATABASE_URL" -c "create extension if not exists fuzzystrmatch; select levenshtein('bellman fod','bellman ford');"   # → 1
```

## 4. Calling it from the app (`lib/db.ts`)

```bash
npm install postgres
```

```ts
import 'server-only';
import postgres from 'postgres';

// One client per server process; reused across requests (avoid creating it per request)
const globalForDb = globalThis as unknown as { sql?: postgres.Sql };
export const sql = globalForDb.sql ?? postgres(process.env.DATABASE_URL!, { ssl: 'require', max: 5 });
if (process.env.NODE_ENV !== 'production') globalForDb.sql = sql;   // survives dev hot reloads
```

Usage. Tagged templates parameterize values, so this is safe from SQL injection:

```ts
const [best] = await sql`
  select coalesce(max(score), 0) as personal_best
  from runs where player_id = ${playerId} and game_id = ${gameId} and status = 'finished'`;

await sql.begin(async (tx) => {            // transaction
  await tx`insert into games ${tx({ module_id, player_id, title, status: 'queued' })}`;
});
```

If you later deploy to a serverless platform and run out of connections, switch `DATABASE_URL` to the service's **connection pooler** URL (Tiger Console → your service → Connection pooling) and pass `{ prepare: false }` to `postgres()`. Transaction-mode pooling doesn't support prepared statements.

## 5. Migrations and the hypertable

The schema lives in `docs/architecture/data-model.md`. F01 turns it into `db/migrations/<timestamp>_init.sql`. Everyone then runs:

```bash
npm run db:migrate     # applies new files in db/migrations/, records them in schema_migrations
npm run db:seed        # F02: demo Module + Game for your Clerk user
```

Check the hypertable exists:

```sql
select hypertable_name from timescaledb_information.hypertables;   -- → guess_events
```

## Reference

- Quickstart: https://www.tigerdata.com/docs/get-started/quickstart/quickstart-5-minutes
- SSL modes: https://docs.timescale.com/use-timescale/latest/security/strict-ssl
- Connection pooling: https://docs.tigerdata.com/use-timescale/latest/services/connection-pooling
- `postgres` client: https://github.com/porsager/postgres
