import "server-only";
import { sql } from "@/lib/db";
import type { Db } from "@/lib/progress";
import { isUuid } from "./mistakes";
import type { PageContext } from "./types";

// Sonar (#83): the Player's own Module a page belongs to. A Module page, or the Reveal or Game page
// of a Game from one of their uploaded Modules. Null on Python Basics (a Course's Module) and
// everywhere else. When set, Sonar stays on that Module: no Python Basics model or planner.

export type CustomModule = { moduleId: string; name: string };

export async function customModuleFor(playerId: string, ctx: PageContext, db: Db = sql): Promise<CustomModule | null> {
  let moduleId: string | null = null;
  if (ctx.kind === "module" && ctx.moduleId && isUuid(ctx.moduleId)) moduleId = ctx.moduleId;
  else if (ctx.kind === "reveal" && ctx.runId && isUuid(ctx.runId)) {
    const [r] = await db<{ module_id: string | null }[]>`
      select g.module_id from runs r join games g on g.id = r.game_id where r.id = ${ctx.runId} and r.player_id = ${playerId}`;
    moduleId = r?.module_id ?? null;
  } else if (ctx.kind === "game" && ctx.gameId && isUuid(ctx.gameId)) {
    const [g] = await db<{ module_id: string | null }[]>`select module_id from games where id = ${ctx.gameId}`;
    moduleId = g?.module_id ?? null;
  }
  if (!moduleId) return null;
  const [m] = await db<{ name: string }[]>`
    select m.name from modules m
     where m.id = ${moduleId} and m.player_id = ${playerId}
       and not exists (select 1 from courses c where c.module_id = m.id)`;
  return m ? { moduleId, name: m.name } : null;
}
