// Unit tests for the Daily Dive's pure parts: Vancouver day math across midnight and DST,
// the share text, and the puzzle checks the seed and the generator share.
import { describe, expect, it } from "vitest";
import pool from "@/db/seed/daily/pool.json";
import { DAILY_EPOCH, nextVancouverMidnight, startOfVancouverDay, vancouverDay } from "./days";
import { alignEvidence, applyVerdicts, capOpenAnswers, cleanTitle, kindErrors, themeFor, verificationItems } from "./generate";
import { buildPuzzleRows, checkPuzzle, type PuzzleFile } from "./puzzle";
import { formatDepth, shareText, siteUrl, tierSquares } from "./share";

const at = (iso: string) => new Date(iso);

describe("Vancouver days", () => {
  it("starts a summer (PDT) day at 07:00 UTC and a winter (PST) day at 08:00 UTC", () => {
    expect(startOfVancouverDay("2026-10-04").toISOString()).toBe("2026-10-04T07:00:00.000Z");
    expect(startOfVancouverDay("2026-12-01").toISOString()).toBe("2026-12-01T08:00:00.000Z");
  });

  it("flips the day exactly at Vancouver midnight", () => {
    expect(vancouverDay(at("2026-10-05T06:59:59.999Z"))).toBe("2026-10-04");
    expect(vancouverDay(at("2026-10-05T07:00:00.000Z"))).toBe("2026-10-05");
    expect(nextVancouverMidnight(at("2026-10-05T06:59:59Z")).toISOString()).toBe("2026-10-05T07:00:00.000Z");
    expect(nextVancouverMidnight(at("2026-10-05T07:00:00Z")).toISOString()).toBe("2026-10-06T07:00:00.000Z");
  });

  it("handles the fall-back day (25 hours) and the spring-forward day (23 hours)", () => {
    // DST ends 2026-11-01 at 02:00 PDT: that day starts in PDT, the next in PST
    expect(startOfVancouverDay("2026-11-01").toISOString()).toBe("2026-11-01T07:00:00.000Z");
    expect(startOfVancouverDay("2026-11-02").toISOString()).toBe("2026-11-02T08:00:00.000Z");
    expect(nextVancouverMidnight(at("2026-11-01T07:30:00Z")).toISOString()).toBe("2026-11-02T08:00:00.000Z");
    expect(vancouverDay(at("2026-11-02T07:30:00Z"))).toBe("2026-11-01"); // 23:30 PST
    // DST starts 2027-03-14 at 02:00 PST
    expect(startOfVancouverDay("2027-03-14").toISOString()).toBe("2027-03-14T08:00:00.000Z");
    expect(startOfVancouverDay("2027-03-15").toISOString()).toBe("2027-03-15T07:00:00.000Z");
    expect(nextVancouverMidnight(at("2027-03-14T08:30:00Z")).toISOString()).toBe("2027-03-15T07:00:00.000Z");
  });

  it("launched Daily #1 on 2026-10-04", () => {
    expect(DAILY_EPOCH).toBe("2026-10-04");
  });
});

describe("share text", () => {
  it("formats depth with a minus sign and thousands separators", () => {
    expect(formatDepth(140)).toBe("−1,400 m");
    expect(formatDepth(7)).toBe("−70 m");
    expect(formatDepth(0)).toBe("0 m");
  });

  it("maps Tiers to squares and misses to black", () => {
    expect(tierSquares(["rare", "deep", "solid", "common", null])).toBe("🟨🟪🟦⬜⬛");
  });

  it("builds the Wordle-style text with the site URL", () => {
    const tiers = ["solid", "rare", null, "common", "deep", "solid", "common"] as const;
    expect(shareText({ number: 12, score: 140, tiers: [...tiers], counted: true }, "https://syllabyss.app")).toBe(
      "SYLLABYSS Daily #12 · −1,400 m\n🟦🟨⬛⬜🟪🟦⬜\nhttps://syllabyss.app/daily",
    );
    expect(shareText({ number: 3, score: 0, tiers: Array(7).fill(null), counted: false }, "http://x")).toBe(
      "SYLLABYSS Daily #3 · 0 m (practice)\n⬛⬛⬛⬛⬛⬛⬛\nhttp://x/daily",
    );
  });

  it("reads NEXT_PUBLIC_SITE_URL, else localhost:3000", () => {
    expect(siteUrl(undefined)).toBe("http://localhost:3000");
    expect(siteUrl("  ")).toBe("http://localhost:3000");
    expect(siteUrl("https://syllabyss.app/")).toBe("https://syllabyss.app");
  });
});

describe("puzzle checks", () => {
  const puzzles = pool.puzzles as unknown as (PuzzleFile & { number: number })[];
  const clone = (p: PuzzleFile) => JSON.parse(JSON.stringify(p)) as Omit<PuzzleFile, "prompts"> & { prompts: Record<string, unknown>[] };

  it("passes every hand-written pool puzzle strictly", () => {
    for (const p of puzzles) {
      const c = checkPuzzle(p, { strict: true });
      expect(c.errors, `#${p.number}`).toEqual([]);
      expect(c.prompts).toHaveLength(7);
    }
  });

  it("refuses Evidence on the wrong fact sheet page", () => {
    const p = clone(puzzles[0]);
    const cloze = p.prompts[3] as { answers: { evidence_page: number }[] };
    cloze.answers[0].evidence_page = 1;
    const c = checkPuzzle(p, { strict: true });
    expect(c.errors.join("\n")).toMatch(/Evidence must be on fact sheet page 4/);
  });

  it("refuses too few Prompts and Open Prompts with too few Answers", () => {
    const p = clone(puzzles[0]);
    p.prompts = p.prompts.slice(0, 6);
    expect(checkPuzzle(p, { strict: true }).errors.join("\n")).toMatch(/needs 7/);
    const q = clone(puzzles[0]);
    (q.prompts[1] as { answers: unknown[] }).answers.splice(5);
    expect(checkPuzzle(q, { strict: true }).errors.join("\n")).toMatch(/has 5 Answers \(want 6-12\)/);
  });

  it("lenient mode accepts a dropped Answer while the rules still hold", () => {
    const p = clone(puzzles[0]);
    // An Answer that isn't on its page: the pipeline drops it
    (p.prompts[0] as { answers: Record<string, unknown>[] }).answers.push({
      canonical: "Bogosort", aliases: [], exact_only: false, evidence_page: 1, evidence_quote: "Bogosort shuffles",
    });
    expect(checkPuzzle(p, { strict: true }).errors.length).toBeGreaterThan(0);
    const lenient = checkPuzzle(p, { strict: false });
    expect(lenient.errors).toEqual([]);
    expect(lenient.dropped.length).toBe(1);
  });

  it("builds content-derived rows: Prompts in fact sheet order, Tiers assigned, Game private until live", () => {
    const c = checkPuzzle(puzzles[0], { strict: true });
    const a = buildPuzzleRows(c, 1);
    const b = buildPuzzleRows(checkPuzzle(puzzles[0], { strict: true }), 1);
    expect(a.game.game.id).toBe(b.game.game.id);
    expect(a.promptIds).toEqual(b.promptIds);
    expect(a.game.game.visibility).toBe("private");
    expect(a.game.game.player_id).toBe("system");
    expect(a.game.prompts.map((p) => p.text)).toEqual(puzzles[0].prompts.map((p) => (p as { text: string }).text));
    expect(a.pages).toHaveLength(7);
    const open = a.game.answers.filter((x) => x.prompt_id === a.promptIds[0]);
    expect(open[0].tier).toBe("common");
    expect(open.at(-1)!.tier).toBe("rare");
    expect(buildPuzzleRows(c, 2).game.game.id).not.toBe(a.game.game.id); // the number is in the title
  });
});

describe("generation helpers", () => {
  const p1 = pool.puzzles[0] as unknown as PuzzleFile;

  it("rotates Q23's themes by puzzle number, Computing first", () => {
    expect(themeFor(1)).toBe("Computing");
    expect(themeFor(2)).toBe("Science");
    expect(themeFor(7)).toBe("Art & Music");
    expect(themeFor(8)).toBe("Computing");
    expect(themeFor(13)).toBe("Mathematics");
  });

  it("requires the fixed kind order", () => {
    expect(kindErrors(p1)).toEqual([]);
    expect(kindErrors({ ...p1, prompts: [...p1.prompts].reverse() })[0]).toMatch(/expected open, open, open/);
  });

  it("asks to verify every Open Answer and every single-answer Prompt", () => {
    const items = verificationItems(p1);
    const open = (p1.prompts as { kind: string; answers?: unknown[] }[]).filter((p) => p.kind === "open");
    expect(items).toHaveLength(open.reduce((n, p) => n + p.answers!.length, 0) + 4);
    expect(items[0]).toMatchObject({ id: "P1.A1", prompt: 1, claim: "Answer: Bubble sort" });
    expect(items.find((x) => x.id === "P6")!.claim).toMatch(/^Correct order: Fortran → COBOL/);
    expect(items.find((x) => x.id === "P7")!.claim).toMatch(/The odd one out is: CSS$/);
  });

  it("drops unsupported Open Answers and fails the puzzle on an unsupported single answer", () => {
    const verdicts = verificationItems(p1).map((x) => ({ id: x.id, supported: x.id !== "P1.A2", reason: "r" }));
    const ok = applyVerdicts(p1, verdicts);
    expect(ok.failed).toEqual([]);
    expect(ok.dropped).toEqual(['P1 "Merge sort": r']);
    expect((ok.puzzle.prompts[0] as { answers: unknown[] }).answers).toHaveLength(11);
    const bad = applyVerdicts(p1, verdicts.filter((v) => v.id !== "P4"));
    expect(bad.failed[0]).toMatch(/^P4 .*no verdict/);
  });

  it("points Prompt N's Evidence at page N and strips a 'Daily Dive' title prefix", () => {
    const shuffled = JSON.parse(JSON.stringify(p1)) as PuzzleFile;
    (shuffled.prompts[0] as { answers: { evidence_page: number }[] }).answers[0].evidence_page = 5;
    (shuffled.prompts[6] as { evidence_page: number }).evidence_page = 2;
    const aligned = alignEvidence(shuffled);
    expect(checkPuzzle(aligned, { strict: true }).errors).toEqual([]);
    expect(cleanTitle({ ...p1, title: "Daily Dive #9: Star Charts" }).title).toBe("Star Charts");
    expect(cleanTitle({ ...p1, title: "Daily Dive" }).title).toBe("Daily Dive");
  });

  it("caps Open Prompts at 12 Answers, keeping the most obvious", () => {
    const answers = Array.from({ length: 14 }, (_, i) => ({ canonical: `a${i}` }));
    const capped = capOpenAnswers({ ...p1, prompts: [{ kind: "open", text: "x", answers }] });
    const kept = (capped.prompts[0] as { answers: { canonical: string }[] }).answers.map((a) => a.canonical);
    expect(kept).toEqual(answers.slice(0, 12).map((a) => a.canonical));
  });
});
