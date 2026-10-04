// Seeding a Course from db/seed/courses/<slug>.json (npm run db:seed:courses). Spec:
// docs/architecture/courses.md § Seed.
//
// How a Course is stored: the system Player owns one Module per Course; each Topic's reading
// is a parsed Source Document whose pages are the reading's pages (so Evidence points at real
// pages); each (Topic, Mode) has one public, ready Game, built from hand-written Prompts that
// go through that Mode's own generation checks (lib/modes/<mode>/generate.ts), exactly like a
// generated Game: answer_keys via normalize(), Open Tiers via assignOpenTiers.
//
// Idempotent and never destructive to play history: every id is derived from the content
// (md5 → uuid). Unchanged content writes nothing new. Changed content makes a new document or
// Game (Games are immutable) and the Topic points at it; the old Game is set private ("retired")
// so its Runs, guesses and leaderboard history stay intact.
//
// Pure apart from seedCourse(tx): relative .ts imports only, so plain Node can load it.

import { createHash } from "node:crypto";
import type postgres from "postgres";
import { dedupeAcrossDocuments } from "../games/validate.ts";
import type { GeneratedPrompt } from "../modes/generation.ts";
import { generatorFor } from "../modes/generators.ts";
import type { ModeId } from "../modes/index.ts";

export const SYSTEM_PLAYER_ID = "system";
const SEED_LOCK = 727_003; // advisory lock namespace (727_001 migrations, 727_002 XP/seed)

// ---------- File shape (scripts/check-seed-content.ts checks it strictly) ----------

export type CourseFile = {
  course: {
    slug: string;
    title: string;
    level: string;
    summary: string;
    description: string;
    banner_theme?: string | null;
    estimated_minutes?: number;
    sort?: number;
  };
  topics: TopicFile[];
};

export type TopicFile = {
  slug: string;
  order: number;
  title: string;
  summary: string;
  minutes?: number | null;
  reading: { pages: { page_number: number; content_md: string }[] };
  resources: { title: string; url: string; source?: string }[];
  games: { mode: string; title: string; prompts?: unknown[]; prompts_from?: string }[];
};

// ---------- Checks ----------

export type CheckedGame = { mode: ModeId; title: string; prompts: GeneratedPrompt[]; raw: unknown[] };
export type CheckedTopic = { topic: TopicFile; games: CheckedGame[] };
export type CheckedCourse = { file: CourseFile; topics: CheckedTopic[]; errors: string[] };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Runs every Topic Game through its Mode's generation checks. Anything the pipeline would
 * drop or clear is an error: hand-written content must pass whole.
 */
export function checkCourse(file: CourseFile): CheckedCourse {
  const errors: string[] = [];
  const c = file.course;
  if (!c || !SLUG.test(c.slug ?? "")) errors.push(`course.slug must be a slug, got ${JSON.stringify(c?.slug)}`);
  if (!Array.isArray(file.topics) || file.topics.length === 0) errors.push("a Course needs at least one Topic");
  const topics: CheckedTopic[] = [];
  const slugs = new Set<string>();

  [...(file.topics ?? [])].sort((a, b) => a.order - b.order).forEach((t, i) => {
    const at = `topic ${t.order} ${t.slug}`;
    if (!SLUG.test(t.slug ?? "")) errors.push(`${at}: slug must be a slug`);
    if (slugs.has(t.slug)) errors.push(`${at}: duplicate slug`);
    slugs.add(t.slug);
    if (t.order !== i + 1) errors.push(`${at}: order should be ${i + 1} (1..n, no gaps)`);
    const pages = (t.reading?.pages ?? []).map((p) => ({ pageNumber: p.page_number, contentMd: p.content_md }));
    if (pages.length === 0) errors.push(`${at}: reading has no pages`);
    pages.forEach((p, j) => {
      if (p.pageNumber !== j + 1) errors.push(`${at}: reading page ${j + 1} has page_number ${p.pageNumber}`);
    });
    for (const r of t.resources ?? []) {
      if (!/^https:\/\//.test(r.url ?? "")) errors.push(`${at}: resource "${r.title}" needs an https url`);
    }

    const games: CheckedGame[] = [];
    const seen = new Set<string>();
    for (const g of t.games ?? []) {
      const gat = `${at} ${g.mode}`;
      const generator = generatorFor(g.mode);
      if (!generator) {
        errors.push(`${gat}: unknown or unavailable Mode`);
        continue;
      }
      if (seen.has(g.mode)) errors.push(`${gat}: more than one ${g.mode} Game`);
      seen.add(g.mode);
      let raw = g.prompts ?? [];
      if (g.prompts_from !== undefined) {
        const from = (t.games ?? []).find((x) => x.mode === g.prompts_from);
        if (!from?.prompts) errors.push(`${gat}: prompts_from "${g.prompts_from}" has no prompts`);
        raw = from?.prompts ?? [];
      }
      const result = generator.validate({ prompts: raw }, pages);
      const deduped = dedupeAcrossDocuments([{ doc: null, prompts: result.prompts }]);
      const final = generator.finalize(deduped.kept);
      for (const d of [...result.dropped, ...deduped.dropped, ...final.dropped]) {
        errors.push(`${gat}: "${d.prompt}" · ${d.what}: ${d.reason}`);
      }
      if (result.quotesCleared) errors.push(`${gat}: ${result.quotesCleared} evidence quotes aren't verbatim on their page`);
      const prompts = final.kept.map((k) => k.prompt);
      if (prompts.length < generator.minPrompts) errors.push(`${gat}: ${prompts.length} Prompts, needs ${generator.minPrompts}`);
      games.push({ mode: g.mode as ModeId, title: g.title, prompts, raw });
    }
    if (games.length === 0) errors.push(`${at}: no practice Games`);
    topics.push({ topic: t, games });
  });
  return { file, topics, errors };
}

// ---------- Rows ----------

/** A stable uuid from a string (md5, formatted as a uuid, like scripts/seed.mts). */
export function seedUuid(key: string): string {
  const h = createHash("md5").update(`course-seed:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

type Row = Record<string, string | number | boolean | null | string[]>;

export type CourseRows = ReturnType<typeof buildCourseRows>;

/** Every row a Course needs, with ids derived from its content. */
export function buildCourseRows(checked: CheckedCourse) {
  const c = checked.file.course;
  const courseId = seedUuid(`course:${c.slug}`);
  const moduleId = seedUuid(`module:${c.slug}`);
  const course = {
    id: courseId,
    slug: c.slug,
    title: c.title,
    level: c.level,
    summary: c.summary,
    description: c.description,
    banner: c.banner_theme ?? null,
    module_id: moduleId,
    sort: c.sort ?? 0,
    published: true,
  };
  const moduleRow = { id: moduleId, player_id: SYSTEM_PLAYER_ID, name: c.title };

  const topics = checked.topics.map(({ topic: t, games }) => {
    const topicId = seedUuid(`topic:${c.slug}:${t.slug}`);
    const filename = `${c.title} ${t.order} · ${t.title}`;
    const contents = t.reading.pages.map((p) => p.content_md);
    const documentId = seedUuid(`document:${c.slug}:${t.slug}:${sha({ filename, contents })}`);
    const pageId = (n: number) => seedUuid(`${documentId}:page:${n}`);
    const document = {
      id: documentId,
      module_id: moduleId,
      player_id: SYSTEM_PLAYER_ID,
      filename,
      mime_type: "text/markdown",
      size_bytes: Buffer.byteLength(contents.join("\n\n"), "utf8"),
      stage_path: null,
      status: "parsed",
      page_count: contents.length,
    };
    const pages = t.reading.pages.map((p) => ({
      id: pageId(p.page_number),
      source_document_id: documentId,
      page_index: p.page_number - 1,
      page_number: p.page_number,
      content_md: p.content_md,
    }));
    const row = {
      id: topicId,
      course_id: courseId,
      position: t.order,
      slug: t.slug,
      title: t.title,
      summary: t.summary,
      minutes: t.minutes ?? null,
      source_document_id: documentId,
      resources: t.resources.map((r) => ({ title: r.title, url: r.url, ...(r.source && { source: r.source }) })),
    };
    return { row, document, pages, games: games.map((g) => buildGameRows(g, documentId, moduleId, pageId)) };
  });
  return { course, module: moduleRow, topics };
}

function buildGameRows(g: CheckedGame, documentId: string, moduleId: string, pageId: (n: number) => string) {
  const gameId = seedUuid(`game:${documentId}:${g.mode}:${sha({ title: g.title, prompts: g.prompts })}`);
  const game = {
    id: gameId,
    module_id: moduleId,
    player_id: SYSTEM_PLAYER_ID,
    title: g.title,
    mode: g.mode,
    status: "ready",
    prompt_count: g.prompts.length,
    visibility: "public",
  };
  const prompts: Row[] = [];
  const answers: Row[] = [];
  const keys: { prompt_id: string; normalized: string; answer_id: string; exact_only: boolean }[] = [];
  g.prompts.forEach((p, i) => {
    const promptId = seedUuid(`${gameId}:prompt:${i}`);
    prompts.push({
      id: promptId,
      game_id: gameId,
      source_document_id: documentId,
      kind: p.kind,
      text: p.text,
      tier: p.tier,
      hint: p.hint,
      explanation: p.explanation,
      items: p.items,
      options: p.options,
      evidence_page_id: p.evidencePage === null ? null : pageId(p.evidencePage),
      is_true: p.isTrue,
    });
    p.answers.forEach((a, j) => {
      const answerId = seedUuid(`${promptId}:answer:${j}`);
      answers.push({
        id: answerId,
        prompt_id: promptId,
        canonical: a.canonical,
        tier: a.tier,
        rarity_rank: a.rarityRank,
        exact_only: a.exactOnly,
        evidence_page_id: pageId(a.evidencePage),
        evidence_quote: a.evidenceQuote,
      });
      for (const normalized of a.keys) keys.push({ prompt_id: promptId, normalized, answer_id: answerId, exact_only: a.exactOnly });
    });
  });
  return { game, prompts, answers, keys };
}

// ---------- Writing ----------

export type SeedStats = {
  courseId: string;
  topics: number;
  documentsCreated: number;
  gamesCreated: number;
  gamesKept: number;
  gamesRetired: number;
  topicsRemoved: number;
};

type Tx = postgres.TransactionSql;

/** The row without its id, for `on conflict (id) do update set …`. */
function omitId<T extends { id: string }>(row: T): Omit<T, "id"> {
  const copy: Partial<T> = { ...row };
  delete copy.id;
  return copy as Omit<T, "id">;
}

/** Writes a Course inside the caller's transaction. Safe to run again: see the header. */
export async function seedCourse(tx: Tx, rows: CourseRows): Promise<SeedStats> {
  const stats: SeedStats = {
    courseId: rows.course.id, topics: rows.topics.length, documentsCreated: 0, gamesCreated: 0, gamesKept: 0, gamesRetired: 0, topicsRemoved: 0,
  };
  await tx`select pg_advisory_xact_lock(${SEED_LOCK}, hashtext(${rows.course.slug}))`;
  await tx`insert into players (id) values (${SYSTEM_PLAYER_ID}) on conflict (id) do nothing`;
  await tx`
    insert into modules ${tx(rows.module)}
    on conflict (id) do update set name = excluded.name`;
  const courseFields = omitId(rows.course);
  await tx`
    insert into courses ${tx(rows.course)}
    on conflict (id) do update set ${tx(courseFields)}`;

  // Topics no longer in the file: their Games are retired, the Topic (and its progress) goes
  const keep = rows.topics.map((t) => t.row.id);
  const gone = await tx<{ id: string }[]>`
    select id from course_topics where course_id = ${rows.course.id} and id <> all(${keep}::uuid[])`;
  if (gone.length) {
    const ids = gone.map((t) => t.id);
    const retired = await tx`
      update games set visibility = 'private'
       where id in (select game_id from topic_games where topic_id = any(${ids}::uuid[])) and visibility = 'public' returning id`;
    stats.gamesRetired += retired.length;
    await tx`delete from course_topics where id = any(${ids}::uuid[])`;
    stats.topicsRemoved = ids.length;
  }

  for (const t of rows.topics) {
    const [existing] = await tx`select 1 from source_documents where id = ${t.document.id}`;
    if (!existing) {
      await tx`insert into source_documents ${tx(t.document)}`;
      await tx`insert into source_pages ${tx(t.pages)}`;
      stats.documentsCreated += 1;
    }
    const topicFields = omitId(t.row);
    const topicRow = { ...t.row, resources: tx.json(t.row.resources) };
    await tx`
      insert into course_topics ${tx(topicRow as never)}
      on conflict (id) do update set ${tx({ ...topicFields, resources: tx.json(t.row.resources) } as never)}`;

    for (const g of t.games) {
      const [have] = await tx`select 1 from games where id = ${g.game.id}`;
      if (have) {
        await tx`update games set visibility = 'public' where id = ${g.game.id}`; // in case it was retired, then restored
        stats.gamesKept += 1;
      } else {
        await insertGame(tx, g, t.document.id);
        stats.gamesCreated += 1;
      }
      const [prev] = await tx<{ game_id: string }[]>`
        select game_id from topic_games where topic_id = ${t.row.id} and mode = ${g.game.mode}`;
      if (prev && prev.game_id !== g.game.id) {
        await tx`update games set visibility = 'private' where id = ${prev.game_id}`;
        stats.gamesRetired += 1;
      }
      await tx`
        insert into topic_games (topic_id, mode, game_id) values (${t.row.id}, ${g.game.mode}, ${g.game.id})
        on conflict (topic_id, mode) do update set game_id = excluded.game_id`;
    }
    // Modes no longer offered on this Topic
    const modes = t.games.map((g) => g.game.mode);
    const dropped = await tx<{ game_id: string }[]>`
      delete from topic_games where topic_id = ${t.row.id} and mode <> all(${modes}::text[]) returning game_id`;
    for (const d of dropped) {
      await tx`update games set visibility = 'private' where id = ${d.game_id}`;
      stats.gamesRetired += 1;
    }
  }
  return stats;
}

async function insertGame(tx: Tx, g: ReturnType<typeof buildGameRows>, documentId: string) {
  await tx`insert into games ${tx(g.game)}`;
  await tx`insert into game_sources (game_id, source_document_id) values (${g.game.id}, ${documentId})`;
  for (const p of g.prompts) {
    await tx`
      insert into prompts (id, game_id, source_document_id, kind, text, tier, hint, explanation,
                           items, options, evidence_page_id, is_true)
      values (${p.id as string}, ${p.game_id as string}, ${p.source_document_id as string}, ${p.kind as string}, ${p.text as string},
              ${p.tier as string | null}, ${p.hint as string | null}, ${p.explanation as string | null},
              ${p.items ? tx.json(p.items as string[]) : null}, ${p.options ? tx.json(p.options as string[]) : null},
              ${p.evidence_page_id as string | null}, ${p.is_true as boolean | null})`;
  }
  if (g.answers.length) await tx`insert into answers ${tx(g.answers as never)}`;
  if (g.keys.length) await tx`insert into answer_keys ${tx(g.keys)}`;
}
