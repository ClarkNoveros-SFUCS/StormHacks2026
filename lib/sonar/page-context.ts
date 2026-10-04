import "server-only";
import { getTopic } from "@/lib/courses/queries";
import { sql } from "@/lib/db";
import type { Db } from "@/lib/progress";
import { COURSE_SLUG, isUuid, recentMistakes } from "./mistakes";
import type { CustomModule } from "./module-scope";
import type { Mistake, PageContext } from "./types";

// Sonar (F32): what the page the Player is on holds, as a compact text block for the agent's
// prompt (well under ~1.5k tokens). Owner checks everywhere: a page the Player can't see
// describes as "not found".

const MAX_CHARS = 5000;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** One line per mistake, for prompts. */
export function mistakeLine(m: Mistake): string {
  const ev = m.evidence ? ` [${m.evidence.documentTitle} p.${m.evidence.pageNumber}, documentId ${m.evidence.documentId}]` : "";
  const c = m.conceptIds.length ? ` {${m.conceptIds.join(",")}}` : "";
  return `- (${m.mode}) "${clip(m.prompt, 140)}" answered "${clip(m.answered, 60)}", correct "${clip(m.correct, 80)}"${ev}${c}`;
}

/** Markdown headings of a page, or its first line when it has none. */
export function headings(md: string): string[] {
  const hs = md.split("\n").filter((l) => /^#{1,3}\s/.test(l)).map((l) => l.replace(/^#+\s*/, "").trim());
  return hs.length ? hs : [clip(md.trim().split("\n")[0] ?? "", 80)];
}

/** `mod`: the Player's own Module the page belongs to (lib/sonar/module-scope.ts); its files and Games are added. */
export async function describeContext(playerId: string, ctx: PageContext, mod: CustomModule | null = null, db: Db = sql): Promise<string> {
  const lines = await describe(playerId, ctx, db);
  if (mod && ctx.kind !== "module") lines.push(`This Game is from the Player's Module:`, ...(await moduleLines(playerId, mod.moduleId, db)));
  return clip(lines.join("\n"), MAX_CHARS);
}

/** A Module's name, files (with documentIds) and Games, or [] when it isn't the Player's. */
async function moduleLines(playerId: string, moduleId: string, db: Db): Promise<string[]> {
  const [m] = await db<{ name: string }[]>`select name from modules where id = ${moduleId} and player_id = ${playerId}`;
  if (!m) return ["Module not found."];
  const files = await db<{ id: string; filename: string; status: string; page_count: number | null }[]>`
    select id, filename, status, page_count from source_documents
     where module_id = ${moduleId} and player_id = ${playerId} order by created_at`;
  const games = await db<{ id: string; title: string; mode: string; status: string }[]>`
    select id, title, mode, status from games
     where module_id = ${moduleId} and player_id = ${playerId} order by created_at desc limit 20`;
  return [
    `Module "${m.name}" (moduleId ${moduleId}).`,
    `Files: ${files.map((f) => `${f.filename} [documentId ${f.id}, ${f.status === "parsed" ? "Ready" : f.status}, ${f.page_count ?? "?"} pages]`).join("; ") || "none"}`,
    `Games: ${games.map((g) => `${g.title} [gameId ${g.id}, ${g.mode}, ${g.status}]`).join("; ") || "none"}`,
  ];
}

async function describe(playerId: string, ctx: PageContext, db: Db): Promise<string[]> {
  const head = `Page: ${ctx.kind} (${ctx.path})`;
  switch (ctx.kind) {
    case "topic": {
      if (!ctx.topicSlug) return [head];
      const t = await getTopic(ctx.courseSlug ?? COURSE_SLUG, ctx.topicSlug, playerId, db);
      if (!t) return [head, "Topic not found."];
      const p = t.progress;
      return [
        head,
        `Topic ${t.number} of ${t.course.title} (${t.course.slug}/${t.slug}): ${t.title}. ${t.summary}`,
        p ? `Course progress: ${p.locked ? "locked" : p.passed ? "passed" : "not passed yet"}${p.read ? ", reading marked read" : ""}.` : "",
        `Reading "${t.reading.title}" pages: ${t.reading.pages.map((pg) => `p.${pg.pageNumber} ${headings(pg.contentMd).slice(0, 3).join(" / ")}`).join("; ")}`,
        `Practice Games: ${t.games.map((g) => `${g.title} [${g.mode}, gameId ${g.gameId}${g.me?.passed ? ", passed" : ""}]`).join("; ")}`,
      ].filter(Boolean);
    }
    case "module": {
      if (!ctx.moduleId || !isUuid(ctx.moduleId)) return [head];
      return [head, ...(await moduleLines(playerId, ctx.moduleId, db))];
    }
    case "reveal": {
      if (!ctx.runId || !isUuid(ctx.runId)) return [head];
      const [r] = await db<{ title: string; mode: string; score: number; status: string; game_id: string }[]>`
        select g.title, g.mode, r.score, r.status, g.id as game_id
          from runs r join games g on g.id = r.game_id where r.id = ${ctx.runId} and r.player_id = ${playerId}`;
      if (!r) return [head, "Run not found."];
      const misses = await recentMistakes(playerId, { kind: "run", runId: ctx.runId }, 8, db);
      return [
        head,
        `Reveal of a ${r.status} Run on "${r.title}" [gameId ${r.game_id}, ${r.mode}], score ${r.score}.`,
        misses.length ? `Misses in this Run:\n${misses.map(mistakeLine).join("\n")}` : "No misses in this Run.",
      ];
    }
    case "game": {
      if (!ctx.gameId || !isUuid(ctx.gameId)) return [head];
      const [g] = await db<{ title: string; mode: string }[]>`
        select title, mode from games where id = ${ctx.gameId} and (player_id = ${playerId} or visibility = 'public')`;
      return g ? [head, `Game "${g.title}" [gameId ${ctx.gameId}, ${g.mode}].`] : [head, "Game not found."];
    }
    default:
      return [head];
  }
}
