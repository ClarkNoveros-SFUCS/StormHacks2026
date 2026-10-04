import "server-only";
import { lockedTopics } from "@/lib/courses/rules";
import { sql } from "@/lib/db";
import { isModeId, MODES, type ModeId } from "@/lib/modes";
import type { Db } from "@/lib/progress";
import { isUuid, ownsModule } from "./mistakes";

// Sonar (F32): the server checks behind "Sonar's pick" and "propose a Game". The agent can only
// recommend a Game the Player can actually start, and only propose a Game the Module can make.

export type Playable =
  | { ok: true; gameId: string; title: string; mode: ModeId; topicSlug: string | null }
  | { ok: false; reason: string };

/**
 * The Game exists and is ready, it's the Player's own or public, and its Topic (if any) isn't locked.
 * With `moduleId`, it must also be one of that Module's Games.
 */
export async function checkPlayable(playerId: string, gameId: string, moduleId?: string, db: Db = sql): Promise<Playable> {
  if (!isUuid(gameId)) return { ok: false, reason: "gameId is not a Game id" };
  const [g] = await db<{ title: string; mode: ModeId; status: string; mine: boolean; public: boolean; module_id: string | null }[]>`
    select title, mode, status, module_id, (player_id = ${playerId}) as mine, (visibility = 'public') as public
      from games where id = ${gameId}`;
  if (!g || (!g.mine && !g.public)) return { ok: false, reason: "No such Game" };
  if (moduleId && g.module_id !== moduleId) return { ok: false, reason: "That Game isn't in this Module" };
  if (g.status !== "ready") return { ok: false, reason: `The Game isn't ready (${g.status})` };

  const [topic] = await db<{ topic_id: string; slug: string; course_id: string }[]>`
    select t.id as topic_id, t.slug, t.course_id from topic_games tg join course_topics t on t.id = tg.topic_id
     where tg.game_id = ${gameId}`;
  if (topic) {
    const topics = await db<{ id: string; passed: boolean }[]>`
      select t.id, (tp.passed_at is not null) as passed
        from course_topics t
        left join topic_progress tp on tp.topic_id = t.id and tp.player_id = ${playerId}
       where t.course_id = ${topic.course_id} order by t.position`;
    const locked = lockedTopics(topics.map((t) => t.passed));
    if (locked[topics.findIndex((t) => t.id === topic.topic_id)]) {
      return { ok: false, reason: "That Topic is still locked: the Player must pass the Topic before it first" };
    }
  }
  return { ok: true, gameId, title: g.title, mode: g.mode, topicSlug: topic?.slug ?? null };
}

export type Proposal = { moduleId: string; sourceDocumentIds: string[]; mode: string };

/** The Module is the Player's, every file belongs to it and is parsed (Ready), and the Mode is available. */
export async function checkProposal(
  playerId: string,
  p: Proposal,
  db: Db = sql,
): Promise<{ ok: true; mode: ModeId } | { ok: false; reason: string }> {
  if (!isModeId(p.mode)) return { ok: false, reason: `Unknown Mode. Use one of: ${Object.keys(MODES).join(", ")}` };
  if (!(await ownsModule(playerId, p.moduleId, db))) return { ok: false, reason: "No such Module" };
  const ids = [...new Set(p.sourceDocumentIds)];
  if (ids.length === 0) return { ok: false, reason: "Pick at least one file" };
  if (!ids.every(isUuid)) return { ok: false, reason: "sourceDocumentIds must be file ids from the Module" };
  const docs = await db<{ id: string; filename: string; status: string }[]>`
    select id, filename, status from source_documents
     where id = any(${ids}::uuid[]) and module_id = ${p.moduleId} and player_id = ${playerId}`;
  if (docs.length !== ids.length) return { ok: false, reason: "Some files aren't in this Module" };
  const notReady = docs.filter((d) => d.status !== "parsed");
  if (notReady.length) return { ok: false, reason: `Not Ready yet: ${notReady.map((d) => d.filename).join(", ")}` };
  return { ok: true, mode: p.mode };
}

/** The file is in the Player's Module, parsed (Ready), and has that page. */
export async function checkReading(
  playerId: string,
  moduleId: string,
  documentId: string,
  page: number,
  db: Db = sql,
): Promise<{ ok: true; filename: string } | { ok: false; reason: string }> {
  if (!isUuid(documentId)) return { ok: false, reason: "documentId must be a file id from the Module" };
  const [d] = await db<{ filename: string; status: string; has_page: boolean; pages: number }[]>`
    select d.filename, d.status,
           exists (select 1 from source_pages sp where sp.source_document_id = d.id and sp.page_number = ${page}) as has_page,
           (select count(*)::int from source_pages sp where sp.source_document_id = d.id) as pages
      from source_documents d
     where d.id = ${documentId} and d.module_id = ${moduleId} and d.player_id = ${playerId}`;
  if (!d) return { ok: false, reason: "That file isn't in this Module" };
  if (d.status !== "parsed") return { ok: false, reason: `${d.filename} isn't Ready yet` };
  if (!d.has_page) return { ok: false, reason: `${d.filename} has no page ${page} (it has ${d.pages} pages)` };
  return { ok: true, filename: d.filename };
}
