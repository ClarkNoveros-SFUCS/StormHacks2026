// #75: rewrites spelled-out maths in Games generated before MATH_NOTATION_RULE ("A intersect B
// equals B intersect A" → "A ∩ B = B ∩ A", "P(Ac)" → "P(Aᶜ)"). Only prompts.text, hint and
// explanation change: options, items and answers stay as they are, because answer checking
// matches against them.
//
//   npm run math:backfill -- --player <playerId>    dry run: print every change, write nothing
//   npm run math:backfill -- --module <moduleId>    same, one Module
//   ... --apply                                      write the changes
//
// One Gemini call per 25 candidate Prompts. Prompts with nothing maths-like are skipped up front.

import path from "node:path";
import postgres from "postgres";
import { defaultModels, generateDocumentPrompts } from "../lib/gemini.ts";
import { MATH_NOTATION_RULE } from "../lib/gemini/math-notation.ts";

const root = path.resolve(import.meta.dirname, "..");
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(root, file));
  } catch {}
}

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const player = arg("--player");
const moduleId = arg("--module");
const apply = process.argv.includes("--apply");
if (!process.env.DATABASE_URL || (!player && !moduleId)) {
  console.error("Usage: npm run math:backfill -- (--player <id> | --module <id>) [--apply]  (DATABASE_URL in .env.local)");
  process.exit(1);
}

// Words and leftovers that suggest spelled-out or broken maths.
const MATHY =
  /\b(union|intersect(s|ion)?|complement|empty set|subset|equals|is equal to|less than|greater than|not equal|divided by|times|squared|sum of|infinity)\b|\bP\([A-Z]c\)|\^|\b[A-Z]\d\b/i;

type Row = { id: string; text: string; hint: string | null; explanation: string | null };
type Fix = { id: string; text: string; hint: string; explanation: string };

const SYSTEM = `You fix maths notation in quiz questions that were already written. You get a JSON list of items, each with an id, its text, and an optional hint and explanation ("" when absent).

Return every item with the same id. Change ONLY how maths is written, following the rule below: replace formulas and set expressions written in words with Unicode symbols, and repair lost symbols. Keep everything else exactly as it is: same wording, same meaning, same facts, same punctuation. Don't make a true statement false or a false one true. If an item has no formula, return it unchanged. Keep "" for an absent hint or explanation.${MATH_NOTATION_RULE}`;

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, text: { type: "string" }, hint: { type: "string" }, explanation: { type: "string" } },
        required: ["id", "text", "hint", "explanation"],
      },
    },
  },
  required: ["items"],
} as const;

const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
try {
  const rows = await sql<Row[]>`
    select p.id, p.text, p.hint, p.explanation
    from prompts p join games g on g.id = p.game_id join modules m on m.id = g.module_id
    where ${player ? sql`m.player_id = ${player}` : sql`m.id = ${moduleId!}`}`;
  const candidates = rows.filter((r) => [r.text, r.hint, r.explanation].some((t) => t && MATHY.test(t)));
  console.log(`${rows.length} prompts, ${candidates.length} look maths-like${apply ? "" : " (dry run)"}`);

  const models = defaultModels();
  const changes: { row: Row; fix: Fix }[] = [];
  for (let i = 0; i < candidates.length; i += 25) {
    const batch = candidates.slice(i, i + 25);
    const input = batch.map((r) => ({ id: r.id, text: r.text, hint: r.hint ?? "", explanation: r.explanation ?? "" }));
    const { response } = await generateDocumentPrompts(
      "quiz",
      [],
      {
        systemInstruction: SYSTEM,
        responseSchema: SCHEMA,
        temperature: 0,
        contents: () => `ITEMS\n${JSON.stringify(input, null, 1)}\n\nFix the maths notation following your instructions.`,
      },
      { models: models.length > 1 ? [models[1], models[0]] : models },
    );
    const byId = new Map(batch.map((r) => [r.id, r]));
    for (const fix of (response as { items?: Fix[] }).items ?? []) {
      const row = byId.get(fix.id);
      if (!row || !fix.text?.trim()) continue;
      const hint = row.hint === null ? null : fix.hint || row.hint;
      const explanation = row.explanation === null ? null : fix.explanation || row.explanation;
      // A rewrite that changes the length a lot isn't a notation fix: skip it.
      if (Math.abs(fix.text.length - row.text.length) > Math.max(20, row.text.length * 0.4)) continue;
      if (fix.text !== row.text || hint !== row.hint || explanation !== row.explanation)
        changes.push({ row, fix: { id: row.id, text: fix.text, hint: hint ?? "", explanation: explanation ?? "" } });
    }
  }

  for (const { row, fix } of changes) {
    if (fix.text !== row.text) console.log(`- ${row.text}\n+ ${fix.text}\n`);
    if (row.hint !== null && fix.hint !== row.hint) console.log(`  hint - ${row.hint}\n  hint + ${fix.hint}\n`);
  }
  console.log(`${changes.length} prompt(s) to change`);

  if (apply && changes.length) {
    await sql.begin(async (tx) => {
      for (const { row, fix } of changes) {
        await tx`
          update prompts set
            text = ${fix.text},
            hint = ${row.hint === null ? null : fix.hint},
            explanation = ${row.explanation === null ? null : fix.explanation}
          where id = ${row.id}`;
      }
    });
    console.log("Applied.");
  }
} finally {
  await sql.end();
}
