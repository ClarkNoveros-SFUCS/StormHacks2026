#!/usr/bin/env node
// Seeds the demo "Graph Algorithms" Module for one Player: a parsed Source Document
// (one page per slide), a ready Dive Game built from db/seed/graph-algorithms.json, and a
// ready Game in every other Mode (Apogee, Leap, Pairs, Blitz) from
// db/seed/graph-algorithms-modes.json, so each Mode can be played without Gemini.
// Needs Node 22.18+ (runs this .mts file directly with built-in type stripping).
// Usage: npm run db:seed -- <clerkUserId>     (or SEED_PLAYER_ID=<clerkUserId> npm run db:seed)
//        npm run db:seed -- --check           validate the fixture only, no database
//
// Idempotent: the demo Module's id is derived from the Player id, so a re-run deletes that
// Module (everything under it cascades) plus its guess_events, then inserts fresh rows.
// Nothing else is touched. Game, Prompt and Answer ids are new on every run, so old
// guesses never count toward the new Game's Mastery.

import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { dedupeAcrossDocuments } from "../lib/games/validate.ts";
import { normalize } from "../lib/matching/normalize.ts";
import type { GeneratedPrompt } from "../lib/modes/generation.ts";
import { generatorFor } from "../lib/modes/generators.ts";
import { MODES, type ModeId } from "../lib/modes/index.ts";
import { assignOpenTiers, TIERS, type Tier } from "../lib/scoring/tiers.ts";

type Kind = "open" | "cloze" | "definition_to_term" | "ordered_recall" | "odd_one_out";

// Prompts use the Gemini response shape from docs/architecture/game-generation-pipeline.md.
// Open Prompt Answers are listed most obvious first and get their Tiers from assignOpenTiers.
interface FixtureAnswer {
  canonical: string;
  aliases: string[];
  exact_only: boolean;
  evidence_page: number;
  evidence_quote: string;
}
interface FixturePrompt {
  kind: Kind;
  text: string;
  answers?: FixtureAnswer[]; // open, cloze, definition_to_term
  tier?: Tier; // single-answer kinds
  hint?: string | null;
  explanation?: string;
  items?: string[]; // ordered_recall, in the correct order
  options?: string[]; // odd_one_out
  correct_option?: string;
  evidence_page?: number; // ordered_recall, odd_one_out
}
interface Fixture {
  module: { name: string };
  document: {
    filename: string;
    mime_type: string;
    size_bytes: number;
    pages: { page_number: number; content_md: string }[];
  };
  game: { title: string; prompts: FixturePrompt[] };
}

const KINDS: Kind[] = ["open", "cloze", "definition_to_term", "ordered_recall", "odd_one_out"];
const TYPED: Kind[] = ["open", "cloze", "definition_to_term"];
const SEED_LOCK_ID = 727_002; // arbitrary; migrate.mjs uses 727_001

// The other Modes' Games: each uses its Mode's Gemini response shape and must pass that
// Mode's generation checks. `prompts_from` reuses graph-algorithms.json's Prompts (Apogee).
interface ModeGameFixture {
  mode: ModeId;
  title: string;
  prompts?: unknown[];
  prompts_from?: "graph-algorithms.json";
}

const root = path.resolve(import.meta.dirname, "..");
const fixturePath = path.join(root, "db", "seed", "graph-algorithms.json");
const modesFixturePath = path.join(root, "db", "seed", "graph-algorithms-modes.json");

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(root, file)); // never overrides variables already set
  } catch {}
}

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const playerId = args.find((a) => !a.startsWith("--")) ?? process.env.SEED_PLAYER_ID;

const fixture: Fixture = JSON.parse(await readFile(fixturePath, "utf8"));
const errors = checkFixture(fixture);
if (errors.length) {
  console.error(`Fixture ${path.relative(root, fixturePath)} is invalid:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
const modeGames: ModeGameFixture[] = JSON.parse(await readFile(modesFixturePath, "utf8")).games;
const checkedModeGames = modeGames.map((g) => checkModeGame(g, fixture));
const modeErrors = checkedModeGames.flatMap((g) => g.errors);
if (modeErrors.length) {
  console.error(`Fixture ${path.relative(root, modesFixturePath)} is invalid:\n- ${modeErrors.join("\n- ")}`);
  process.exit(1);
}
if (checkOnly) {
  console.log(`Fixture OK: ${fixture.document.pages.length} pages, ${fixture.game.prompts.length} Prompts.`);
  for (const g of checkedModeGames) console.log(`  ${MODES[g.mode].name}: ${g.prompts.length} Prompts`);
  process.exit(0);
}

if (!playerId) {
  console.error("Usage: npm run db:seed -- <clerkUserId>   (find it in the Clerk dashboard → Users)");
  process.exit(1);
}
if (!playerId.startsWith("user_")) console.warn(`Warning: "${playerId}" doesn't look like a Clerk user id.`);
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Put it in .env.local (see .env.example).");
  process.exit(1);
}

const rows = buildRows(fixture, playerId);
const modeRows = checkedModeGames.map((g) => buildModeRows(g, rows));
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });

try {
  await sql.begin(async (tx) => {
    // Two seeds for the same Player run one after the other instead of colliding on the Module id
    await tx`select pg_advisory_xact_lock(${SEED_LOCK_ID}, hashtext(${playerId}))`;
    await tx`insert into players (id) values (${playerId}) on conflict (id) do nothing`;

    // guess_events has no foreign keys, so clear the old demo Game's guesses by hand
    await tx`
      delete from guess_events
      where player_id = ${playerId}
        and game_id in (select id from games where module_id = ${rows.moduleId})`;
    const [{ count: replaced }] = await tx`
      with d as (delete from modules where id = ${rows.moduleId} and player_id = ${playerId} returning 1)
      select count(*)::int as count from d`;

    await tx`insert into modules (id, player_id, name) values (${rows.moduleId}, ${playerId}, ${fixture.module.name})`;
    await tx`insert into source_documents ${tx(rows.document)}`;
    await tx`insert into source_pages ${tx(rows.pages)}`;
    await tx`insert into games ${tx(rows.game)}`;
    await tx`insert into game_sources (game_id, source_document_id) values (${rows.game.id}, ${rows.document.id})`;
    for (const p of rows.prompts) {
      await tx`
        insert into prompts (id, game_id, source_document_id, kind, text, tier, hint, explanation,
                             items, options, evidence_page_id)
        values (${p.id}, ${p.game_id}, ${p.source_document_id}, ${p.kind}, ${p.text}, ${p.tier},
                ${p.hint}, ${p.explanation}, ${p.items && tx.json(p.items)}, ${p.options && tx.json(p.options)}, ${p.evidence_page_id})`;
    }
    await tx`insert into answers ${tx(rows.answers)}`;
    await tx`insert into answer_keys ${tx(rows.keys)}`;

    // One ready Game per other Mode, on the same document
    for (const g of modeRows) {
      await tx`insert into games ${tx(g.game)}`;
      await tx`insert into game_sources (game_id, source_document_id) values (${g.game.id}, ${rows.document.id})`;
      for (const p of g.prompts) {
        await tx`
          insert into prompts (id, game_id, source_document_id, kind, text, tier, hint, explanation,
                               items, options, evidence_page_id, is_true)
          values (${p.id}, ${p.game_id}, ${p.source_document_id}, ${p.kind}, ${p.text}, ${p.tier},
                  ${p.hint}, ${p.explanation}, ${p.items && tx.json(p.items)}, ${p.options && tx.json(p.options)},
                  ${p.evidence_page_id}, ${p.is_true})`;
      }
      await tx`insert into answers ${tx(g.answers)}`;
      if (g.keys.length) await tx`insert into answer_keys ${tx(g.keys)}`;
    }

    console.log(replaced ? "Replaced the existing demo Module." : "Created the demo Module.");
  });

  const byKind = KINDS.map((k) => `${k} ${rows.prompts.filter((p) => p.kind === k).length}`).join(", ");
  const byTier = TIERS.map((t) => `${t} ${rows.answers.filter((a) => a.tier === t).length}`).join(", ");
  console.log(`Player:   ${playerId}`);
  console.log(`Module:   ${rows.moduleId}  "${fixture.module.name}"`);
  console.log(`Document: ${rows.document.id}  ${fixture.document.filename} (${rows.pages.length} pages)`);
  console.log(`Game:     ${rows.game.id}  "${fixture.game.title}"`);
  console.log(`Prompts:  ${rows.prompts.length} (${byKind})`);
  console.log(`Answers:  ${rows.answers.length} (${byTier}); answer_keys: ${rows.keys.length}`);
  for (const g of modeRows) {
    console.log(`${(MODES[g.game.mode].name + ":").padEnd(9)} ${g.game.id}  "${g.game.title}" (${g.prompts.length} Prompts)`);
  }
} catch (err) {
  console.error("\nSeed failed:", (err as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}

/** One uuid per Player, so a re-run finds and replaces the demo Module and never a real one. */
function demoModuleId(player: string): string {
  const h = createHash("md5").update(`seed:graph-algorithms:${player}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function keysOf(a: FixtureAnswer): string[] {
  return [...new Set([a.canonical, ...a.aliases].map(normalize))];
}

/** Whole-word containment on normalized text. */
function containsWords(haystack: string, needle: string): boolean {
  return needle !== "" && ` ${haystack} `.includes(` ${needle} `);
}

function buildRows(f: Fixture, player: string) {
  const moduleId = demoModuleId(player);
  const documentId = randomUUID();
  const gameId = randomUUID();
  const pageIds = new Map(f.document.pages.map((p) => [p.page_number, randomUUID()]));
  const pageId = (n: number) => pageIds.get(n)!;

  const document = {
    id: documentId,
    module_id: moduleId,
    player_id: player,
    filename: f.document.filename,
    mime_type: f.document.mime_type,
    size_bytes: f.document.size_bytes,
    stage_path: null, // unused since ADR-0003 (files aren't kept)
    status: "parsed",
    page_count: f.document.pages.length,
  };
  const pages = f.document.pages.map((p) => ({
    id: pageId(p.page_number),
    source_document_id: documentId,
    page_index: p.page_number - 1,
    page_number: p.page_number,
    content_md: p.content_md,
  }));
  const game = {
    id: gameId,
    module_id: moduleId,
    player_id: player,
    title: f.game.title,
    mode: "dive",
    status: "ready",
    prompt_count: f.game.prompts.length,
  };

  const prompts: Record<string, string | string[] | null>[] = [];
  const answers: Record<string, string | number | boolean | null>[] = [];
  const keys: { prompt_id: string; normalized: string; answer_id: string; exact_only: boolean }[] = [];
  for (const p of f.game.prompts) {
    const promptId = randomUUID();
    const single = p.kind !== "open";
    prompts.push({
      id: promptId,
      game_id: gameId,
      source_document_id: documentId,
      kind: p.kind,
      text: p.text,
      tier: single ? p.tier! : null,
      hint: single ? (p.hint ?? null) : null,
      explanation: p.explanation ?? null,
      items: p.items ?? null,
      options: p.options ?? null,
      evidence_page_id: p.evidence_page ? pageId(p.evidence_page) : null,
    });

    if (p.kind === "ordered_recall" || p.kind === "odd_one_out") {
      // One Answer per Prompt keeps Mastery a uniform count over answers
      answers.push({
        id: randomUUID(),
        prompt_id: promptId,
        canonical: p.kind === "ordered_recall" ? "correct order" : p.correct_option!,
        tier: p.tier!,
        rarity_rank: null,
        exact_only: false,
        evidence_page_id: pageId(p.evidence_page!),
        evidence_quote: null,
      });
      continue;
    }

    const tiers = single ? null : assignOpenTiers(p.answers!.length);
    p.answers!.forEach((a, i) => {
      const answerId = randomUUID();
      answers.push({
        id: answerId,
        prompt_id: promptId,
        canonical: a.canonical,
        tier: tiers ? tiers[i] : p.tier!,
        rarity_rank: tiers ? i + 1 : null,
        exact_only: a.exact_only,
        evidence_page_id: pageId(a.evidence_page),
        evidence_quote: a.evidence_quote,
      });
      for (const normalized of keysOf(a)) {
        keys.push({ prompt_id: promptId, normalized, answer_id: answerId, exact_only: a.exact_only });
      }
    });
  }
  return { moduleId, document, pages, game, prompts, answers, keys };
}

type CheckedModeGame = { mode: ModeId; title: string; prompts: GeneratedPrompt[]; errors: string[] };

/**
 * Runs a Mode Game's Prompts through that Mode's own generation checks (lib/modes/<mode>/
 * generate.ts), exactly as a generated Game would be. Any drop, cleared quote or shortfall is an error.
 */
function checkModeGame(g: ModeGameFixture, f: Fixture): CheckedModeGame {
  const at = `${g.mode} "${g.title}"`;
  const generator = generatorFor(g.mode);
  if (!generator) return { mode: g.mode, title: g.title, prompts: [], errors: [`${at}: unknown or unavailable Mode`] };
  const raw = g.prompts_from === "graph-algorithms.json" ? f.game.prompts : (g.prompts ?? []);
  const pages = f.document.pages.map((p) => ({ pageNumber: p.page_number, contentMd: p.content_md }));
  const result = generator.validate({ prompts: raw }, pages);
  const deduped = dedupeAcrossDocuments([{ doc: null, prompts: result.prompts }]);
  const final = generator.finalize(deduped.kept);
  const errors = [...result.dropped, ...deduped.dropped, ...final.dropped].map((d) => `${at}: "${d.prompt}" · ${d.what}: ${d.reason}`);
  if (result.quotesCleared) errors.push(`${at}: ${result.quotesCleared} evidence quotes aren't verbatim on their page`);
  const prompts = final.kept.map((k) => k.prompt);
  if (prompts.length < generator.minPrompts) errors.push(`${at}: ${prompts.length} Prompts, needs ${generator.minPrompts}`);
  return { mode: g.mode, title: g.title, prompts, errors };
}

/** Rows for one Mode Game on the demo document (same shape generate-game.ts writes). */
function buildModeRows(g: CheckedModeGame, base: ReturnType<typeof buildRows>) {
  const gameId = randomUUID();
  const pageId = new Map(base.pages.map((p) => [p.page_number, p.id]));
  const game = {
    id: gameId,
    module_id: base.moduleId,
    player_id: base.document.player_id,
    title: g.title,
    mode: g.mode,
    status: "ready",
    prompt_count: g.prompts.length,
  };
  const prompts = [];
  const answers: Record<string, string | number | boolean | null>[] = [];
  const keys: { prompt_id: string; normalized: string; answer_id: string; exact_only: boolean }[] = [];
  for (const p of g.prompts) {
    const promptId = randomUUID();
    prompts.push({
      id: promptId,
      game_id: gameId,
      source_document_id: base.document.id,
      kind: p.kind,
      text: p.text,
      tier: p.tier,
      hint: p.hint,
      explanation: p.explanation,
      items: p.items,
      options: p.options,
      evidence_page_id: p.evidencePage === null ? null : pageId.get(p.evidencePage)!,
      is_true: p.isTrue,
    });
    for (const a of p.answers) {
      const answerId = randomUUID();
      answers.push({
        id: answerId,
        prompt_id: promptId,
        canonical: a.canonical,
        tier: a.tier,
        rarity_rank: a.rarityRank,
        exact_only: a.exactOnly,
        evidence_page_id: pageId.get(a.evidencePage)!,
        evidence_quote: a.evidenceQuote,
      });
      for (const normalized of a.keys) keys.push({ prompt_id: promptId, normalized, answer_id: answerId, exact_only: a.exactOnly });
    }
  }
  return { game, prompts, answers, keys };
}

/** The fixture must pass the same checks a generated Game does (game-generation-pipeline.md). */
function checkFixture(f: Fixture): string[] {
  const errs: string[] = [];
  const pages = new Map(f.document.pages.map((p) => [p.page_number, p.content_md]));
  f.document.pages.forEach((p, i) => {
    if (p.page_number !== i + 1) errs.push(`pages must be numbered 1..n in order (index ${i} is page ${p.page_number})`);
  });

  const prompts = f.game.prompts;
  if (prompts.length < 7) errs.push(`a Game needs at least 7 Prompts, got ${prompts.length}`);
  for (const k of KINDS) if (!prompts.some((p) => p.kind === k)) errs.push(`no ${k} Prompt`);

  const texts = new Set<string>();
  for (const p of prompts) {
    const at = `"${p.text}"`;
    if (!KINDS.includes(p.kind)) errs.push(`${at}: unknown kind ${p.kind}`);
    if (texts.has(normalize(p.text))) errs.push(`${at}: duplicate Prompt text`);
    texts.add(normalize(p.text));
    const evidencePage = (n: number | undefined, what: string) => {
      if (n === undefined || !pages.has(n)) {
        errs.push(`${at}: ${what} cites missing page ${n}`);
        return "";
      }
      return normalize(pages.get(n)!);
    };

    const single = p.kind !== "open";
    if (single) {
      if (!p.tier || !TIERS.includes(p.tier)) errs.push(`${at}: single-answer Prompt needs a tier`);
      if (!p.explanation) errs.push(`${at}: single-answer Prompt needs an explanation`);
    } else if (p.tier || p.hint) {
      errs.push(`${at}: Open Prompts have no tier or hint`);
    }

    if (TYPED.includes(p.kind)) {
      const answers = p.answers ?? [];
      if (single ? answers.length !== 1 : answers.length < 4 || answers.length > 15) {
        errs.push(`${at}: has ${answers.length} Answers (open: 4-15, single-answer: 1)`);
      }
      const owner = new Map<string, string>();
      for (const a of answers) {
        const shapeOk =
          typeof a.canonical === "string" &&
          Array.isArray(a.aliases) &&
          a.aliases.every((s) => typeof s === "string") &&
          typeof a.exact_only === "boolean" &&
          Number.isInteger(a.evidence_page);
        if (!shapeOk) {
          errs.push(`${at}: an Answer needs canonical (string), aliases (string[]), exact_only (boolean), evidence_page (integer)`);
          continue;
        }
        const keys = keysOf(a);
        const page = evidencePage(a.evidence_page, a.canonical);
        if (page && !keys.some((k) => containsWords(page, k))) {
          errs.push(`${at}: page ${a.evidence_page} doesn't mention "${a.canonical}" or an Alias`);
        }
        if (!a.evidence_quote || a.evidence_quote.length > 200) {
          errs.push(`${at}: "${a.canonical}" needs an evidence_quote of at most 200 characters`);
        } else if (pages.has(a.evidence_page) && !pages.get(a.evidence_page)!.includes(a.evidence_quote)) {
          errs.push(`${at}: "${a.canonical}" evidence_quote isn't verbatim on page ${a.evidence_page}`);
        }
        for (const k of keys) {
          if (!k) errs.push(`${at}: "${a.canonical}" has a key that normalizes to nothing`);
          else if (owner.has(k)) errs.push(`${at}: key "${k}" belongs to both "${owner.get(k)}" and "${a.canonical}"`);
          else owner.set(k, a.canonical);
        }
        if (single && p.hint) {
          const hint = normalize(p.hint);
          for (const k of keys) if (containsWords(hint, k)) errs.push(`${at}: hint gives away "${k}"`);
        }
      }
    }

    if (p.kind === "ordered_recall") {
      const items = p.items ?? [];
      if (items.length < 3 || items.length > 6) errs.push(`${at}: needs 3-6 items, got ${items.length}`);
      if (new Set(items.map(normalize)).size !== items.length) errs.push(`${at}: items must be distinct`);
      evidencePage(p.evidence_page, "the Prompt");
    }

    if (p.kind === "odd_one_out") {
      const options = p.options ?? [];
      const correct = normalize(p.correct_option ?? "");
      if (options.length !== 4 || new Set(options.map(normalize)).size !== 4) {
        errs.push(`${at}: needs exactly 4 distinct options`);
      }
      // Exact, not normalized: one-shot answers are checked by direct comparison (run-and-scoring.md)
      if (!options.includes(p.correct_option ?? "")) errs.push(`${at}: correct_option isn't exactly one of the options`);
      const page = evidencePage(p.evidence_page, "the Prompt");
      if (page && !containsWords(page, correct)) errs.push(`${at}: page ${p.evidence_page} doesn't mention the correct option`);
      if (p.hint && containsWords(normalize(p.hint), correct)) errs.push(`${at}: hint gives away the correct option`);
    }
  }
  return errs;
}
