import { getApiPlayer } from "@/lib/auth";
import { sql } from "@/lib/db";
import { bubbleFor, type BubbleFacts } from "@/lib/sonar/bubble";
import { contextFromPath } from "@/lib/sonar/context-path";
import { loadSonarModel } from "@/lib/sonar/queries";
import type { BubbleResponse, PageContext } from "@/lib/sonar/types";

// Sonar (F32): GET /api/sonar/bubble?path=<pathname> → { bubble }. The mascot's speech bubble
// for the page, templated from the model (lib/sonar/bubble.ts), no LLM. Fast, and never fails
// the client: any error is { bubble: null }. Spec: docs/architecture/sonar.md (Q10).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const playerId = await getApiPlayer();
  if (!playerId) return Response.json({ error: "Not signed in" }, { status: 401 });
  try {
    const path = new URL(req.url).searchParams.get("path") ?? "/";
    const ctx = contextFromPath(path);
    const body: BubbleResponse = { bubble: bubbleFor(ctx, await factsFor(ctx, playerId)) };
    return Response.json(body);
  } catch (err) {
    console.error("sonar bubble:", err);
    return Response.json({ bubble: null } satisfies BubbleResponse);
  }
}

async function factsFor(ctx: PageContext, playerId: string): Promise<BubbleFacts> {
  if (ctx.kind === "topic" && ctx.courseSlug === "python-basics") return { model: await loadSonarModel(playerId) };
  if (ctx.kind === "reveal" && ctx.runId && UUID.test(ctx.runId)) return { run: await runMisses(playerId, ctx.runId) };
  if (ctx.kind === "module" && ctx.moduleId) return { module: await moduleMisses(playerId, ctx.moduleId) };
  return {};
}

/** The caller's finished Run: wrong and timed-out Prompts, with its Topic's title if it's a Topic Game. */
async function runMisses(playerId: string, runId: string): Promise<BubbleFacts["run"]> {
  const [r] = await sql<{ misses: number; prompts: number; topic_title: string | null; game_title: string }[]>`
    select count(*) filter (where rp.outcome in ('wrong', 'timeout'))::int as misses,
           count(rp.outcome)::int as prompts,
           (select t.title from topic_games tg join course_topics t on t.id = tg.topic_id where tg.game_id = r.game_id) as topic_title,
           g.title as game_title
      from runs r
      join games g on g.id = r.game_id
      left join run_prompts rp on rp.run_id = r.id
     where r.id = ${runId} and r.player_id = ${playerId} and r.status = 'finished'
     group by r.id, g.title`;
  return r ? { misses: r.misses, prompts: r.prompts, topicTitle: r.topic_title, gameTitle: r.game_title } : null;
}

/** The caller's misses on this Module's Games in the last 7 days, by the Prompt's source file. */
async function moduleMisses(playerId: string, moduleId: string): Promise<BubbleFacts["module"]> {
  const files = await sql<{ filename: string; misses: number }[]>`
    select sd.filename, count(*)::int as misses
      from runs r
      join games g on g.id = r.game_id
      join run_prompts rp on rp.run_id = r.id
      join prompts p on p.id = rp.prompt_id
      join source_documents sd on sd.id = p.source_document_id
     where r.player_id = ${playerId} and g.module_id = ${moduleId}
       and rp.outcome in ('wrong', 'timeout') and rp.ended_at > now() - interval '7 days'
     group by sd.filename
     order by misses desc, sd.filename`;
  return { misses: files.reduce((n, f) => n + f.misses, 0), files };
}
