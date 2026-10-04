import "server-only";
import { sql } from "@/lib/db";
import type { ModeId } from "@/lib/modes";
import type { Db } from "@/lib/progress";
import { conceptsForPrompt } from "./tags";
import type { Mistake } from "./types";

// Sonar (F32): the Player's recent wrong guesses and timeouts, with the right Answer, the
// explanation and the Evidence, for the agent's tools and snapshot. Every query filters by the
// Player id. Wrong guesses come from guess_events; timeouts aren't logged there, so they come
// from run_prompts.outcome = 'timeout'.

export type MistakeScope =
  | { kind: "course" } // Python Basics: Games in the Course's Module
  | { kind: "module"; moduleId: string } // owner-only
  | { kind: "run"; runId: string }
  | { kind: "game"; gameId: string };

export const COURSE_SLUG = "python-basics";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID.test(s);

/**
 * What the Player submitted, readable. raw_text per data-model.md: typed kinds are plain text;
 * one-shot kinds and Leap/Arena are JSON (an option string or an order array); Blitz is
 * "true"/"false"; Pairs is {"term","definition"}.
 */
export function decodeAnswered(raw: string | null): string {
  if (raw === null) return "(timeout)";
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "True" : "False";
  if (Array.isArray(v)) return v.map(String).join(" → ");
  if (v && typeof v === "object" && "term" in v && "definition" in v) {
    const p = v as { term: unknown; definition: unknown };
    return `${String(p.term)} ↔ ${String(p.definition)}`;
  }
  return raw; // a number or anything else: what they typed
}

type Row = {
  at: Date;
  game_id: string;
  prompt_id: string;
  raw_text: string | null;
  game_title: string;
  mode: ModeId;
  prompt: string;
  kind: string;
  explanation: string | null;
  correct: string | null;
  doc_title: string | null;
  page_number: number | null;
  quote: string | null;
  topic_slug: string | null;
  in_course: boolean;
};

/** True when the Player owns the Module. */
export async function ownsModule(playerId: string, moduleId: string, db: Db = sql): Promise<boolean> {
  if (!isUuid(moduleId)) return false;
  const [m] = await db`select 1 from modules where id = ${moduleId} and player_id = ${playerId}`;
  return Boolean(m);
}

/** The Player's latest mistakes in a scope, newest first. Empty for a Module they don't own. */
export async function recentMistakes(playerId: string, scope: MistakeScope, limit = 8, db: Db = sql): Promise<Mistake[]> {
  const n = Math.max(1, Math.min(50, Math.floor(limit)));
  let gameFilter;
  let runFilter;
  if (scope.kind === "course") {
    gameFilter = db`and game_id in (select g.id from games g join courses c on c.module_id = g.module_id where c.slug = ${COURSE_SLUG})`;
  } else if (scope.kind === "module") {
    if (!(await ownsModule(playerId, scope.moduleId, db))) return [];
    gameFilter = db`and game_id in (select id from games where module_id = ${scope.moduleId} and player_id = ${playerId})`;
  } else if (scope.kind === "game") {
    if (!isUuid(scope.gameId)) return [];
    gameFilter = db`and game_id = ${scope.gameId}`;
  } else {
    if (!isUuid(scope.runId)) return [];
    runFilter = scope.runId;
  }
  // Applies to both halves of the union (its columns are game_id and run_id).
  const scopeFilter = runFilter ? db`and run_id = ${runFilter}` : gameFilter!;

  const rows = await db<Row[]>`
    with ev as (
      select at, game_id, prompt_id, raw_text from (
        select ge.created_at as at, ge.game_id, ge.prompt_id, ge.raw_text, ge.run_id
          from guess_events ge
         where ge.player_id = ${playerId} and not ge.is_correct
        union all
        select rp.ended_at as at, r.game_id, rp.prompt_id, null as raw_text, r.id as run_id
          from run_prompts rp join runs r on r.id = rp.run_id
         where r.player_id = ${playerId} and rp.outcome = 'timeout' and rp.ended_at is not null
      ) u
      where true ${scopeFilter}
      order by at desc
      limit ${n}
    )
    select ev.at, ev.game_id, ev.prompt_id, ev.raw_text,
           g.title as game_title, g.mode, p.text as prompt, p.kind, p.explanation,
           ans.correct, sd.filename as doc_title, sp.page_number, ans.quote,
           t.slug as topic_slug, (c.id is not null) as in_course
      from ev
      join prompts p on p.id = ev.prompt_id
      join games g on g.id = ev.game_id and (g.player_id = ${playerId} or g.visibility = 'public')
      left join lateral (
        select case when p.kind = 'open'
                    then (select string_agg(canonical, ' / ' order by rarity_rank nulls last)
                            from (select canonical, rarity_rank from answers where prompt_id = p.id
                                   order by rarity_rank nulls last limit 3) top)
                    else (select canonical from answers where prompt_id = p.id limit 1) end as correct,
               (select evidence_page_id from answers where prompt_id = p.id and evidence_page_id is not null
                 order by rarity_rank nulls last limit 1) as page_id,
               (select evidence_quote from answers where prompt_id = p.id and evidence_quote is not null
                 order by rarity_rank nulls last limit 1) as quote
      ) ans on true
      left join source_pages sp on sp.id = coalesce(ans.page_id, p.evidence_page_id)
      left join source_documents sd on sd.id = sp.source_document_id
      left join topic_games tg on tg.game_id = g.id
      left join course_topics t on t.id = tg.topic_id
      left join courses c on c.id = t.course_id and c.slug = ${COURSE_SLUG}
     order by ev.at desc`;

  return rows.map((r) => ({
    at: new Date(r.at).toISOString(),
    gameId: r.game_id,
    gameTitle: r.game_title,
    mode: r.mode,
    promptId: r.prompt_id,
    prompt: r.prompt,
    answered: decodeAnswered(r.raw_text),
    correct: r.correct ?? "",
    explanation: r.explanation,
    evidence: r.page_number !== null ? { documentTitle: r.doc_title ?? "", pageNumber: r.page_number, quote: r.quote } : null,
    conceptIds: r.in_course ? conceptsForPrompt(r.prompt, r.topic_slug) : [],
  }));
}
