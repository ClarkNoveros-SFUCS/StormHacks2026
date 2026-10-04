import "server-only";
import type postgres from "postgres";
import { getApiPlayer } from "@/lib/auth";
import { sql } from "@/lib/db";
import { RunError } from "./run-engine";

// Shared wrapper for the Run route handlers: auth, one transaction, the server's clock,
// and RunError → HTTP status. Anything else is a 500.
export async function runRoute<T>(
  fn: (tx: postgres.TransactionSql, playerId: string, now: Date) => Promise<T>,
): Promise<Response> {
  const playerId = await getApiPlayer();
  if (!playerId) return Response.json({ error: "Not signed in" }, { status: 401 });
  try {
    const now = new Date();
    const result = await sql.begin((tx) => fn(tx, playerId, now));
    return Response.json(result);
  } catch (e) {
    if (e instanceof RunError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new RunError(400, "Expected a JSON body");
  }
}
