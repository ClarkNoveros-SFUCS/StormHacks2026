// Checks the hand-written seed content for Courses (F22) and the Daily Dive pool (F23)
// without the app or the database: shapes (zod), counts, Evidence quotes verbatim on their
// page, Hints that don't give the Answer away, unique Open Prompt Answers, and every Dive
// Prompt through the same checks a generated Game gets (lib/games/validate.ts), strictly:
// anything the pipeline would drop or clear is an error here.
//
//   npm run seed:content:check
//   npm run seed:content:check -- --course <file> --daily <file>   check other files
//   ... --partial   check only the files named, and skip whole-collection rules (6 Topics,
//                   >= 10 puzzles, numbering, days): for a file holding only some while writing
//
// Shapes mirror each Mode's Gemini response (lib/modes/<mode>/generate.ts) so the loaders
// can run the files through the Modes' own generation checks too.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { containsWords, validateDocument, type DocumentPage } from "../lib/games/validate.ts";
import { normalize } from "../lib/matching/normalize.ts";
import { TIERS } from "../lib/scoring/tiers.ts";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const argValue = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const coursePath = argValue("--course") ?? path.join(root, "db", "seed", "courses", "python-basics.json");
const dailyPath = argValue("--daily") ?? path.join(root, "db", "seed", "daily", "pool.json");
const partial = args.includes("--partial");

// ---------- Shapes ----------

const Tier = z.enum(TIERS);
const Text = z.string().trim().min(1);
const Page = z.strictObject({ page_number: z.number().int().positive(), content_md: Text });
const Answer = z.strictObject({
  canonical: Text,
  aliases: z.array(Text),
  exact_only: z.boolean(),
  evidence_page: z.number().int().positive(),
  evidence_quote: Text.max(200),
});
const Single = { text: Text, tier: Tier, hint: Text, explanation: Text };

const DivePrompt = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("open"), text: Text, answers: z.array(Answer).min(4).max(15), explanation: Text.optional() }),
  z.strictObject({ kind: z.literal("cloze"), ...Single, answers: z.array(Answer).length(1) }),
  z.strictObject({ kind: z.literal("definition_to_term"), ...Single, answers: z.array(Answer).length(1) }),
  z.strictObject({ kind: z.literal("ordered_recall"), ...Single, items: z.array(Text).min(3).max(6), evidence_page: z.number().int().positive() }),
  z.strictObject({
    kind: z.literal("odd_one_out"), ...Single,
    options: z.array(Text).length(4), correct_option: Text, evidence_page: z.number().int().positive(),
  }),
]);
type DivePrompt = z.infer<typeof DivePrompt>;

const LeapPrompt = z.strictObject({
  kind: z.literal("multiple_choice"),
  text: Text,
  options: z.array(Text).length(4),
  correct_option: Text,
  explanation: Text,
  tier: Tier,
  evidence_page: z.number().int().positive(),
  evidence_quote: Text.max(200),
});
type LeapPrompt = z.infer<typeof LeapPrompt>;

const PairsPrompt = z.strictObject({
  kind: z.literal("definition_to_term"),
  text: Text.max(200),
  answers: z.array(Answer).length(1),
  tier: Tier,
  explanation: Text,
});
type PairsPrompt = z.infer<typeof PairsPrompt>;

const BlitzPrompt = z.strictObject({
  kind: z.literal("true_false"),
  text: Text.max(200),
  is_true: z.boolean(),
  tier: Tier,
  evidence_page: z.number().int().positive(),
  evidence_quote: Text.max(200),
  explanation: Text,
});
type BlitzPrompt = z.infer<typeof BlitzPrompt>;

const TopicGame = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("dive"), title: Text, prompts: z.array(DivePrompt) }),
  z.strictObject({ mode: z.literal("apogee"), title: Text, prompts_from: z.literal("dive") }),
  z.strictObject({ mode: z.literal("leap"), title: Text, prompts: z.array(LeapPrompt) }),
  z.strictObject({ mode: z.literal("pairs"), title: Text, prompts: z.array(PairsPrompt) }),
  z.strictObject({ mode: z.literal("blitz"), title: Text, prompts: z.array(BlitzPrompt) }),
]);

const Slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const ALLOWED_HOSTS = ["docs.python.org", "peps.python.org", "realpython.com", "www.w3schools.com"];

const Topic = z.strictObject({
  slug: Slug,
  order: z.number().int().positive(),
  title: Text,
  summary: Text,
  minutes: z.number().int().positive(),
  reading: z.strictObject({ pages: z.array(Page).min(3).max(5) }),
  resources: z.array(z.strictObject({ title: Text, url: z.url({ protocol: /^https$/ }), source: Text })).min(3).max(4),
  games: z.array(TopicGame),
});
type Topic = z.infer<typeof Topic>;

const CourseFile = z.strictObject({
  _comment: z.string().optional(),
  course: z.strictObject({
    slug: Slug,
    title: Text,
    level: z.enum(["Beginner", "Intermediate", "Advanced"]),
    summary: Text,
    description: Text,
    banner_theme: Slug,
    estimated_minutes: z.number().int().positive(),
  }),
  topics: z.array(Topic).min(1),
});

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const Puzzle = z.strictObject({
  number: z.number().int().positive(),
  day: Day,
  theme: Text,
  title: Text,
  fact_sheet: z.strictObject({ pages: z.array(Page).length(7) }),
  prompts: z.array(DivePrompt).length(7),
});
type Puzzle = z.infer<typeof Puzzle>;
const PoolFile = z.strictObject({ _comment: z.string().optional(), puzzles: z.array(Puzzle).min(1) });

// ---------- Helpers ----------

const errors: string[] = [];
const err = (at: string, msg: string) => errors.push(`${at}: ${msg}`);
const collapse = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const quoteOn = (quote: string, page: string | undefined) => page !== undefined && collapse(page).includes(collapse(quote));
const short = (s: string) => (s.length > 50 ? `${s.slice(0, 47)}...` : s);
const keysOf = (a: { canonical: string; aliases: string[] }) => [...new Set([a.canonical, ...a.aliases].map(normalize))];
const words = (md: string) => md.replace(/```[\s\S]*?```/g, " ").split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;

function pagesOf(pages: { page_number: number; content_md: string }[], at: string): DocumentPage[] {
  pages.forEach((p, i) => {
    if (p.page_number !== i + 1) err(at, `page ${i + 1} has page_number ${p.page_number} (number pages 1..n in order)`);
  });
  return pages.map((p) => ({ pageNumber: p.page_number, contentMd: p.content_md }));
}

function issues(e: z.ZodError) {
  return e.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}

/** Prompt text must be unique within a Game (check 7). */
function uniqueTexts(texts: string[], at: string) {
  const seen = new Set<string>();
  for (const t of texts) {
    const k = normalize(t);
    if (seen.has(k)) err(at, `duplicate Prompt text "${short(t)}"`);
    seen.add(k);
  }
}

/**
 * Dive-kind Prompts: the pipeline's own checks (nothing may be dropped or cleared), plus
 * stricter ones: every quote verbatim, Hints never naming the Answer, unique Open Answers,
 * odd_one_out's correct option on its cited page.
 */
function checkDive(prompts: DivePrompt[], pages: DocumentPage[], at: string) {
  const pageText = new Map(pages.map((p) => [p.pageNumber, p.contentMd]));
  const result = validateDocument({ prompts }, pages);
  for (const d of result.dropped) err(at, `pipeline drops ${d.what} of "${short(d.prompt)}": ${d.reason}`);
  if (result.quotesCleared) err(at, `${result.quotesCleared} evidence quotes would be cleared`);

  prompts.forEach((p, i) => {
    const pat = `${at} prompt ${i + 1} (${p.kind} "${short(p.text)}")`;
    if (p.kind === "open" || p.kind === "cloze" || p.kind === "definition_to_term") {
      const owner = new Map<string, string>();
      for (const a of p.answers) {
        if (!pageText.has(a.evidence_page)) err(pat, `"${a.canonical}" cites missing page ${a.evidence_page}`);
        else if (!quoteOn(a.evidence_quote, pageText.get(a.evidence_page))) {
          err(pat, `"${a.canonical}" evidence_quote isn't verbatim on page ${a.evidence_page}`);
        }
        for (const k of keysOf(a)) {
          if (!k) err(pat, `"${a.canonical}" has a key that normalizes to nothing`);
          else if (owner.has(k)) err(pat, `key "${k}" belongs to both "${owner.get(k)}" and "${a.canonical}"`);
          else owner.set(k, a.canonical);
        }
      }
      if (p.kind !== "open") {
        const hint = normalize(p.hint);
        for (const k of keysOf(p.answers[0])) if (containsWords(hint, k)) err(pat, `hint gives away "${k}"`);
      }
    }
    if (p.kind === "odd_one_out") {
      if (!p.options.includes(p.correct_option)) err(pat, "correct_option isn't exactly one of the options");
      const page = pageText.get(p.evidence_page);
      if (page === undefined) err(pat, `cites missing page ${p.evidence_page}`);
      else if (!containsWords(normalize(page), normalize(p.correct_option))) err(pat, `page ${p.evidence_page} doesn't name the correct option`);
      if (containsWords(normalize(p.hint), normalize(p.correct_option))) err(pat, "hint gives away the correct option");
    }
    if (p.kind === "ordered_recall" && !pageText.has(p.evidence_page)) err(pat, `cites missing page ${p.evidence_page}`);
  });
  uniqueTexts(prompts.map((p) => p.text), at);
}

const BANNED_OPTION = /^(all|none|both|neither) of (the )?(above|these|them)$|^both [a-d] and [a-d]$/i;
const optionKey = (o: string) => o.toLowerCase().replace(/\s+/g, " ").trim();

/** Mirrors lib/modes/leap/generate.ts validateLeap, strictly. */
function checkLeap(prompts: LeapPrompt[], pages: DocumentPage[], at: string) {
  const pageText = new Map(pages.map((p) => [p.pageNumber, p.contentMd]));
  prompts.forEach((p, i) => {
    const pat = `${at} prompt ${i + 1} ("${short(p.text)}")`;
    if (new Set(p.options.map(optionKey)).size !== 4 || p.options.some((o) => !normalize(o))) err(pat, "options aren't 4 distinct options");
    if (p.options.some((o) => BANNED_OPTION.test(normalize(o)))) err(pat, 'uses "all/none of the above"');
    if (p.options.filter((o) => o === p.correct_option).length !== 1) err(pat, "correct_option isn't exactly one of the options");
    if (!pageText.has(p.evidence_page)) err(pat, `cites missing page ${p.evidence_page}`);
    else if (!quoteOn(p.evidence_quote, pageText.get(p.evidence_page))) err(pat, `evidence_quote isn't verbatim on page ${p.evidence_page}`);
    const stem = normalize(p.text);
    const named = (o: string) => normalize(o).length > 2 && containsWords(stem, normalize(o));
    if (named(p.correct_option) && !p.options.some((o) => o !== p.correct_option && named(o))) err(pat, "the stem gives away the answer");
  });
  uniqueTexts(prompts.map((p) => p.text), at);
}

/** Dive's checks for definition_to_term plus lib/modes/pairs/generate.ts' card checks. */
function checkPairs(prompts: PairsPrompt[], pages: DocumentPage[], at: string) {
  const result = validateDocument({ prompts }, pages);
  for (const d of result.dropped) err(at, `pipeline drops ${d.what} of "${short(d.prompt)}": ${d.reason}`);
  if (result.quotesCleared) err(at, `${result.quotesCleared} evidence quotes would be cleared`);
  const pageText = new Map(pages.map((p) => [p.pageNumber, p.contentMd]));
  const terms = new Map<string, string>();
  prompts.forEach((p, i) => {
    const pat = `${at} pair ${i + 1} ("${short(p.text)}")`;
    const [a] = p.answers;
    if (!quoteOn(a.evidence_quote, pageText.get(a.evidence_page))) err(pat, `evidence_quote isn't verbatim on page ${a.evidence_page}`);
    if (a.canonical.split(/\s+/).length > 6) err(pat, "term is over 6 words");
    const def = normalize(p.text);
    for (const k of keysOf(a)) if (containsWords(def, k)) err(pat, `the definition names its own term ("${k}")`);
    for (const k of keysOf(a)) {
      if (terms.has(k)) err(pat, `term key "${k}" repeats pair "${terms.get(k)}"`);
      else terms.set(k, a.canonical);
    }
  });
  uniqueTexts(prompts.map((p) => p.text), at);
}

/** Mirrors lib/modes/blitz/generate.ts validateBlitz and its true/false balance, strictly. */
function checkBlitz(prompts: BlitzPrompt[], pages: DocumentPage[], at: string) {
  const pageText = new Map(pages.map((p) => [p.pageNumber, p.contentMd]));
  prompts.forEach((p, i) => {
    const pat = `${at} statement ${i + 1} ("${short(p.text)}")`;
    if (!pageText.has(p.evidence_page)) return err(pat, `cites missing page ${p.evidence_page}`);
    if (!quoteOn(p.evidence_quote, pageText.get(p.evidence_page))) err(pat, `evidence_quote isn't verbatim on page ${p.evidence_page}`);
    if (!p.is_true && containsWords(normalize(pageText.get(p.evidence_page)!), normalize(p.text))) {
      err(pat, "a false statement that appears verbatim in the notes");
    }
  });
  const trues = prompts.filter((p) => p.is_true).length;
  const falses = prompts.length - trues;
  if (Math.max(trues, falses) > Math.floor(Math.min(trues, falses) * 1.5)) {
    err(at, `${trues} true / ${falses} false is too unbalanced (larger side at most 1.5x the smaller)`);
  }
  uniqueTexts(prompts.map((p) => p.text), at);
}

// ---------- Course ----------

const MIN = { dive: 8, leap: 12, pairs: 12, blitz: 30 } as const;
const DIVE_KINDS = ["open", "cloze", "definition_to_term", "ordered_recall", "odd_one_out"] as const;

async function load(file: string) {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

function checkTopic(t: Topic, index: number) {
  const at = `topic ${t.order} ${t.slug}`;
  if (!partial && t.order !== index + 1) err(at, `order is ${t.order}, expected ${index + 1}`);
  const pages = pagesOf(t.reading.pages, `${at} reading`);
  const md = t.reading.pages.map((p) => p.content_md).join("\n");
  const n = words(md);
  if (n < 400 || n > 700) err(at, `reading has ${n} words outside code blocks (want 400-700)`);
  if (!/```python\n/.test(md)) err(at, "reading has no ```python code block");
  if (!/common mistakes/i.test(md)) err(at, 'reading has no "Common mistakes" box');
  for (const r of t.resources) {
    const host = new URL(r.url).hostname;
    if (!ALLOWED_HOSTS.includes(host)) err(at, `resource ${r.url} isn't on ${ALLOWED_HOSTS.join(", ")}`);
  }

  const modes = t.games.map((g) => g.mode);
  for (const m of ["dive", "apogee", "leap", "pairs", "blitz"]) {
    if (modes.filter((x) => x === m).length !== 1) err(at, `needs exactly one ${m} game`);
  }
  const counts: Record<string, number> = {};
  for (const g of t.games) {
    const gat = `${at} ${g.mode}`;
    if (g.mode === "apogee") continue;
    counts[g.mode] = g.prompts.length;
    if (g.prompts.length < MIN[g.mode]) err(gat, `has ${g.prompts.length} Prompts (need >= ${MIN[g.mode]})`);
    if (g.mode === "dive") {
      checkDive(g.prompts, pages, gat);
      for (const k of DIVE_KINDS) if (!g.prompts.some((p) => p.kind === k)) err(gat, `has no ${k} Prompt`);
      const open = g.prompts.filter((p) => p.kind === "open");
      if (open.length < 2) err(gat, `has ${open.length} open Prompts (need >= 2)`);
      for (const p of open) if (p.answers.length > 8) err(gat, `open "${short(p.text)}" has ${p.answers.length} Answers (want 4-8)`);
    }
    if (g.mode === "leap") checkLeap(g.prompts, pages, gat);
    if (g.mode === "pairs") checkPairs(g.prompts, pages, gat);
    if (g.mode === "blitz") checkBlitz(g.prompts, pages, gat);
  }
  return { slug: t.slug, pages: pages.length, words: n, resources: t.resources.length, ...counts };
}

// ---------- Daily pool ----------

function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function checkPuzzle(p: Puzzle) {
  const at = `daily #${p.number}`;
  const pages = pagesOf(p.fact_sheet.pages, `${at} fact_sheet`);
  checkDive(p.prompts, pages, at);
  p.prompts.forEach((q, i) => {
    const pages = q.kind === "ordered_recall" || q.kind === "odd_one_out" ? [q.evidence_page] : q.answers.map((a) => a.evidence_page);
    if (pages.some((n) => n !== i + 1)) err(`${at} prompt ${i + 1}`, `Evidence must be on fact sheet page ${i + 1}`);
  });
  const open = p.prompts.filter((q) => q.kind === "open");
  if (open.length < 3) err(at, `has ${open.length} open Prompts (need >= 3)`);
  for (const q of open) {
    if (q.answers.length < 6 || q.answers.length > 12) err(at, `open "${short(q.text)}" has ${q.answers.length} Answers (want 6-12)`);
  }
  return { number: p.number, day: p.day ?? "spare", theme: p.theme, open: open.length, answers: open.map((q) => q.answers.length).join("/") };
}

function checkPool(puzzles: Puzzle[]) {
  if (partial) return puzzles.map(checkPuzzle);
  if (puzzles.length < 10) err("daily", `has ${puzzles.length} puzzles (need >= 10)`);
  puzzles.forEach((p, i) => {
    if (p.number !== i + 1) err(`daily #${p.number}`, `number should be ${i + 1} (in order, no gaps)`);
  });
  const expected = ["2026-10-04", ...Array.from({ length: 6 }, (_, i) => addDays("2026-10-04", i + 1))];
  expected.forEach((day, i) => {
    if (puzzles[i] && puzzles[i].day !== day) err(`daily #${i + 1}`, `day should be ${day}, got ${puzzles[i].day}`);
  });
  const days = puzzles.map((p) => p.day).filter((d): d is string => d !== null);
  if (new Set(days).size !== days.length) err("daily", "two puzzles share a day");
  for (const p of puzzles.slice(7)) if (p.day !== null) err(`daily #${p.number}`, "spares (after #7) should have day null");
  if (puzzles[0] && !/comput/i.test(puzzles[0].theme)) err("daily #1", `launch day should be CS-themed, theme is "${puzzles[0].theme}"`);
  uniqueTexts(puzzles.map((p) => p.title), "daily titles");
  uniqueTexts(puzzles.flatMap((p) => p.prompts.map((q) => q.text)), "daily pool (Prompt text across puzzles)");
  return puzzles.map(checkPuzzle);
}

// ---------- Run ----------

// --partial checks only the files named on the command line.
const checkCourse = !partial || args.includes("--course");
const checkDaily = !partial || args.includes("--daily");
const course = checkCourse ? CourseFile.safeParse(await load(coursePath)) : null;
const pool = checkDaily ? PoolFile.safeParse(await load(dailyPath)) : null;
if (course && !course.success) err(path.relative(root, coursePath), `shape: ${issues(course.error)}`);
if (pool && !pool.success) err(path.relative(root, dailyPath), `shape: ${issues(pool.error)}`);

if (course?.success) {
  if (!partial && course.data.topics.length !== 6) err("course", `has ${course.data.topics.length} Topics (need 6)`);
  const rows = course.data.topics.map(checkTopic);
  console.log(`Course "${course.data.course.title}" (${course.data.course.slug}): ${rows.length} Topics`);
  console.table(rows);
}
if (pool?.success) {
  const rows = checkPool(pool.data.puzzles);
  console.log(`Daily Dive pool: ${rows.length} puzzles`);
  console.table(rows);
}

if (errors.length) {
  console.error(`\n${errors.length} problem${errors.length === 1 ? "" : "s"}:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("\nAll seed content checks passed.");
