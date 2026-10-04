"use server";
import { requirePlayer } from "@/lib/auth";
import { sql } from "@/lib/db";

const MAX_MODULE_NAME = 80;

/** Creates a Module for the signed-in Player. Returns its id, or a user-facing error. */
export async function createModule(name: string): Promise<{ id: string } | { error: string }> {
  const playerId = await requirePlayer();
  const clean = typeof name === "string" ? name.replace(/\s+/g, " ").trim() : "";
  if (!clean) return { error: "Give your Module a name" };
  if (clean.length > MAX_MODULE_NAME) return { error: `Keep the name under ${MAX_MODULE_NAME} characters` };
  const [row] = await sql<{ id: string }[]>`
    insert into modules (player_id, name) values (${playerId}, ${clean}) returning id`;
  return { id: row.id };
}
