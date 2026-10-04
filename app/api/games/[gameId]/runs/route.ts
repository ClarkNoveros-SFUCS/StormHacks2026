import { runRoute } from "@/lib/runs/http";
import { createRun } from "@/lib/runs/run-engine";

// Start a new Run of this Game (abandons the Player's other in-progress Runs). → { runId }
export async function POST(_req: Request, ctx: RouteContext<"/api/games/[gameId]/runs">) {
  const { gameId } = await ctx.params;
  return runRoute((tx, playerId, now) => createRun(tx, playerId, gameId, now));
}
