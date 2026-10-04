import "server-only";
import snowflake from "snowflake-sdk";

// Snowflake holds uploaded files on an internal stage and parses them with AI_PARSE_DOCUMENT.
// Setup and env vars: docs/setup/snowflake.md. Never import this from client components.
//
// Only validated values reach SQL text: the stage name (env), stage prefixes built from ids,
// and filenames from `stageFilename()`. PUT and REMOVE can't take bind variables.

snowflake.configure({ logLevel: "WARN" });

const STATEMENT_TIMEOUT_SECONDS = 300;
const SAFE_PATH = /^[A-Za-z0-9_\-./]+$/;

function stage(): string {
  const name = process.env.SNOWFLAKE_STAGE;
  if (!name || !/^[A-Za-z0-9_$.]+$/.test(name)) throw new Error("SNOWFLAKE_STAGE is missing or invalid");
  return name;
}

function assertSafe(path: string) {
  if (!SAFE_PATH.test(path) || path.includes("..")) throw new Error(`Unsafe stage path: ${path}`);
}

function connect(): Promise<snowflake.Connection> {
  const privateKey = process.env.SNOWFLAKE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!privateKey) throw new Error("SNOWFLAKE_PRIVATE_KEY is not set");
  const conn = snowflake.createConnection({
    account: process.env.SNOWFLAKE_ACCOUNT!,
    username: process.env.SNOWFLAKE_USER!,
    authenticator: "SNOWFLAKE_JWT",
    privateKey,
    role: process.env.SNOWFLAKE_ROLE,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    database: process.env.SNOWFLAKE_DATABASE,
    schema: process.env.SNOWFLAKE_SCHEMA,
  });
  return new Promise((resolve, reject) => conn.connect((err) => (err ? reject(err) : resolve(conn))));
}

function exec<T = Record<string, unknown>>(conn: snowflake.Connection, sqlText: string, binds: snowflake.Binds = []) {
  return new Promise<T[]>((resolve, reject) =>
    conn.execute({
      sqlText,
      binds,
      parameters: { STATEMENT_TIMEOUT_IN_SECONDS: STATEMENT_TIMEOUT_SECONDS },
      complete: (err, _stmt, rows) => (err ? reject(err) : resolve((rows ?? []) as T[])),
    }),
  );
}

/** Opens one connection, runs `fn`, and always closes the connection. */
export async function withSnowflake<T>(fn: (conn: snowflake.Connection) => Promise<T>): Promise<T> {
  const conn = await connect();
  try {
    return await fn(conn);
  } finally {
    await new Promise<void>((resolve) => conn.destroy(() => resolve()));
  }
}

/** Uploads a local file to `@STAGE/<prefix>/`. The staged name is the local file's basename. */
export async function putFile(conn: snowflake.Connection, localPath: string, prefix: string) {
  assertSafe(localPath);
  assertSafe(prefix);
  await exec(conn, `PUT 'file://${localPath}' @${stage()}/${prefix}/ AUTO_COMPRESS = FALSE OVERWRITE = TRUE`);
}

/**
 * Runs AI_PARSE_DOCUMENT (LAYOUT, one page per entry) on a staged file and returns the raw
 * result. `return_error_details = TRUE` turns failures into `{ value, error }` instead of
 * NULL; `toParsedPages()` in lib/documents/parsed-pages.ts handles every shape.
 */
export async function parseStagedFile(conn: snowflake.Connection, stagePath: string): Promise<unknown> {
  assertSafe(stagePath);
  const [row] = await exec<{ PARSED: unknown }>(
    conn,
    `SELECT AI_PARSE_DOCUMENT(TO_FILE('@${stage()}', ?), {'mode': 'LAYOUT', 'page_split': true}, TRUE) AS PARSED`,
    [stagePath],
  );
  return row?.PARSED ?? null;
}

/** Deletes everything under `@STAGE/<prefix>/`. */
export async function removeStagedFile(conn: snowflake.Connection, prefix: string) {
  assertSafe(prefix);
  await exec(conn, `REMOVE @${stage()}/${prefix}/`);
}
