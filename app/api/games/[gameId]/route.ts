import { getApiPlayer } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getPlayerGame } from "@/lib/games/queries";

/** One Game's status and source files. Poll while it's queued/generating. */
export async function GET(_req: Request, ctx: RouteContext<"/api/games/[gameId]">) {
  const playerId = await getApiPlayer();
  if (!playerId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const game = await getPlayerGame(playerId, (await ctx.params).gameId);
  if (!game) return Response.json({ error: "Game not found" }, { status: 404 });
  return Response.json({ game });
}

/**
 * Deletes a Game with its Prompts, Runs and guesses. Works in any status: a Game deleted
 * while generating makes generateGame's insert fail, and nothing is stored.
 */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/games/[gameId]">) {
  const playerId = await getApiPlayer();
  if (!playerId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const game = await getPlayerGame(playerId, (await ctx.params).gameId);
  if (!game) return Response.json({ error: "Game not found" }, { status: 404 });

  await sql.begin(async (tx) => {
    // guess_events (a hypertable) has no foreign keys, so its rows go by hand
    await tx`delete from guess_events where player_id = ${playerId} and game_id = ${game.id}`;
    await tx`delete from games where id = ${game.id} and player_id = ${playerId}`;
  });
  return new Response(null, { status: 204 });
}
