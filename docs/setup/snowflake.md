# Snowflake setup (file storage + PDF parsing)

Used by **F03 Upload pipeline**. Snowflake stores uploaded files in a stage and parses them with `AI_PARSE_DOCUMENT`. One person sets this up once for the team (~20 min), then shares the values for `.env.local` privately. Never commit them.

## 1. Create the account

1. Sign up for the free trial from the MLH partner page: https://www.mlh.com/partners/snowflake. It's a 120-day trial.
2. Pick **Enterprise** edition, and **AWS US West 2 (Oregon)** as the region if offered. That region runs Cortex AI functions natively. In other regions you need step 3's cross-region setting.
3. Log in to **Snowsight**, the web UI.

## 2. Find your account identifier

Snowsight → click your name (bottom-left) → **Account** → **View account details** (or "Connect a tool to Snowflake"). Copy the **account identifier**, which looks like `ORGNAME-ACCOUNTNAME`. That's `SNOWFLAKE_ACCOUNT`.

## 3. Run the setup SQL

Snowsight → **Projects → Worksheets → +**, then paste and run all of this. You're `ACCOUNTADMIN` on a trial.

```sql
USE ROLE ACCOUNTADMIN;

-- Only needed if your region doesn't run Cortex natively (harmless otherwise)
ALTER ACCOUNT SET CORTEX_ENABLED_CROSS_REGION = 'ANY_REGION';

CREATE WAREHOUSE IF NOT EXISTS STUDY_WH
  WAREHOUSE_SIZE = 'XSMALL' AUTO_SUSPEND = 60 AUTO_RESUME = TRUE;   -- suspends after 60 s idle, saves credits
CREATE DATABASE IF NOT EXISTS STUDY_DB;
CREATE SCHEMA   IF NOT EXISTS STUDY_DB.APP;

CREATE STAGE IF NOT EXISTS STUDY_DB.APP.STUDY_DOCS
  DIRECTORY  = (ENABLE = TRUE)
  ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE');   -- AI_PARSE_DOCUMENT requires an encrypted stage

-- A least-privilege role + service user for the app
CREATE ROLE IF NOT EXISTS STUDY_APP;
GRANT USAGE ON WAREHOUSE STUDY_WH            TO ROLE STUDY_APP;
GRANT USAGE ON DATABASE  STUDY_DB            TO ROLE STUDY_APP;
GRANT USAGE ON SCHEMA    STUDY_DB.APP        TO ROLE STUDY_APP;
GRANT READ, WRITE ON STAGE STUDY_DB.APP.STUDY_DOCS TO ROLE STUDY_APP;
GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER    TO ROLE STUDY_APP;   -- required for AI_PARSE_DOCUMENT

CREATE USER IF NOT EXISTS STUDY_APP_USER
  TYPE = SERVICE
  DEFAULT_ROLE = STUDY_APP
  DEFAULT_WAREHOUSE = STUDY_WH;
GRANT ROLE STUDY_APP TO USER STUDY_APP_USER;
```

## 4. Give the service user a key pair

Service users sign in with a key, not a password. Snowflake is phasing out password-only sign-in. On your machine:

```bash
openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out snowflake_key.p8 -nocrypt
openssl rsa -in snowflake_key.p8 -pubout -out snowflake_key.pub
```

Copy the public key's body, everything between the `-----BEGIN/END PUBLIC KEY-----` lines, joined into one line. Then in Snowsight:

```sql
ALTER USER STUDY_APP_USER SET RSA_PUBLIC_KEY = 'MIIBIjANBgkqh…';
```

Store the **private key** (`snowflake_key.p8`) in your password manager or team vault. Never commit it: `*.pem` is gitignored, but `.p8` isn't, so keep it outside the repo.

## 5. Check parsing works (no code needed)

1. Snowsight → **Data → Databases → STUDY_DB → APP → Stages → STUDY_DOCS → + Files**, and upload any lecture PDF.
2. Run:
   ```sql
   SELECT AI_PARSE_DOCUMENT(
     TO_FILE('@STUDY_DB.APP.STUDY_DOCS', 'your-file.pdf'),
     {'mode': 'LAYOUT', 'page_split': true}) AS parsed;
   ```
3. You should get JSON like `{ "pages": [ { "content": "# Week 9 …", "index": 0 }, … ] }`. If you get a permissions or region error, re-check step 3.

Parsing is billed per page from the trial credits. The service's hard limits are 100 MB and 2,000 pages per file; our app caps uploads lower (25 MB, 100 pages).

## 6. Environment variables (`.env.local`)

```bash
SNOWFLAKE_ACCOUNT=ORGNAME-ACCOUNTNAME
SNOWFLAKE_USER=STUDY_APP_USER
SNOWFLAKE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE…\n-----END PRIVATE KEY-----"   # the .p8 contents, newlines as \n
SNOWFLAKE_ROLE=STUDY_APP
SNOWFLAKE_WAREHOUSE=STUDY_WH
SNOWFLAKE_DATABASE=STUDY_DB
SNOWFLAKE_SCHEMA=APP
SNOWFLAKE_STAGE=STUDY_DOCS
```

## 7. Calling it from the app (`lib/snowflake.ts`)

```bash
npm install snowflake-sdk
```

`snowflake-sdk` is a Node-only package, so keep it out of the bundler. Add this to `next.config.ts` (see `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverExternalPackages.md`):

```ts
const nextConfig = { serverExternalPackages: ['snowflake-sdk'] };
```

A minimal helper (server only; never import it from client components):

```ts
import 'server-only';
import snowflake from 'snowflake-sdk';

function connect() {
  const conn = snowflake.createConnection({
    account: process.env.SNOWFLAKE_ACCOUNT!,
    username: process.env.SNOWFLAKE_USER!,
    authenticator: 'SNOWFLAKE_JWT',
    privateKey: process.env.SNOWFLAKE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    role: process.env.SNOWFLAKE_ROLE,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    database: process.env.SNOWFLAKE_DATABASE,
    schema: process.env.SNOWFLAKE_SCHEMA,
  });
  return new Promise<snowflake.Connection>((resolve, reject) =>
    conn.connect((err) => (err ? reject(err) : resolve(conn))));
}

function exec<T = Record<string, unknown>>(conn: snowflake.Connection, sqlText: string, binds: snowflake.Binds = []) {
  return new Promise<T[]>((resolve, reject) =>
    conn.execute({ sqlText, binds, complete: (err, _stmt, rows) => (err ? reject(err) : resolve((rows ?? []) as T[])) }));
}

// Upload: PUT needs a real local file path (write the upload to os.tmpdir() first)
await exec(conn, `PUT 'file://${tmpPath}' @${process.env.SNOWFLAKE_STAGE}/${prefix}/ AUTO_COMPRESS = FALSE OVERWRITE = TRUE`);

// Parse
const [row] = await exec<{ PARSED: unknown }>(conn,
  `SELECT AI_PARSE_DOCUMENT(TO_FILE('@${process.env.SNOWFLAKE_STAGE}', ?), {'mode': 'LAYOUT', 'page_split': true}) AS PARSED`,
  [`${prefix}/${filename}`]);
const parsed = typeof row.PARSED === 'string' ? JSON.parse(row.PARSED) : row.PARSED;   // VARIANT may arrive as a string
// parsed.pages: { content: string; index: number }[]

// Delete
await exec(conn, `REMOVE @${process.env.SNOWFLAKE_STAGE}/${prefix}/`);
```

Verify before relying on it: driver option names (`authenticator`, `privateKey`) and `PUT` support can change between `snowflake-sdk` versions. Check the driver docs if a call fails: https://docs.snowflake.com/en/developer-guide/node-js/nodejs-driver

## Reference

- AI_PARSE_DOCUMENT: https://docs.snowflake.com/en/sql-reference/functions/ai_parse_document
- Parsing guide (limits, regions, access): https://docs.snowflake.com/en/user-guide/snowflake-cortex/parse-document
- Staging local files (PUT): https://docs.snowflake.com/user-guide/data-load-local-file-system-stage
