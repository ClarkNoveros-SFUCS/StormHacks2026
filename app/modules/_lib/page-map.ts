// The Module page map (#90): how the Player is doing on each page of each file, across every Game
// of the Module. A guess or timeout counts against the page its Prompt's Evidence is on. Pure.

export type PageStatus = "solid" | "shaky" | "missing" | "untested";

export type MapPage = {
  pageNumber: number;
  /** First heading of the page, for the tooltip. */
  title: string;
  right: number;
  wrong: number;
  timeouts: number;
  /** 0–1, recent answers weigh more; null when untested. */
  score: number | null;
  status: PageStatus;
};

export type MapFile = { documentId: string; filename: string; pages: MapPage[] };

export type ModuleMap = {
  files: MapFile[];
  /** Up to 5 tested pages with the lowest score, worst first. */
  weakest: (MapPage & { documentId: string; filename: string })[];
  answers: number;
  /** Share right of every answer, 0–1 (0 with no answers). */
  overall: number;
};

export type MapObservation = { documentId: string; pageNumber: number; correct: boolean; timeout: boolean; at: Date };
export type MapSourcePage = { documentId: string; filename: string; pageNumber: number; contentMd: string };

/** An answer's weight halves every week, so the map follows the Player's recent form. */
export const HALF_LIFE_HOURS = 168;
export const SOLID = 0.75;
export const SHAKY = 0.5;
const WEAKEST = 5;

export function statusOf(score: number | null): PageStatus {
  if (score === null) return "untested";
  return score >= SOLID ? "solid" : score >= SHAKY ? "shaky" : "missing";
}

/** The page's first markdown heading, or its first line. */
export function pageTitle(md: string): string {
  const lines = md.split("\n").map((l) => l.trim()).filter(Boolean);
  const h = lines.find((l) => /^#{1,3}\s/.test(l));
  const t = (h ?? lines[0] ?? "").replace(/^#+\s*/, "").replace(/[*_`]/g, "");
  return t.length > 60 ? `${t.slice(0, 59)}…` : t;
}

export function buildModuleMap(pages: MapSourcePage[], obs: MapObservation[], now: Date): ModuleMap {
  const key = (d: string, p: number) => `${d}:${p}`;
  const acc = new Map<string, { right: number; wrong: number; timeouts: number; w: number; wRight: number }>();
  for (const o of obs) {
    const k = key(o.documentId, o.pageNumber);
    const a = acc.get(k) ?? { right: 0, wrong: 0, timeouts: 0, w: 0, wRight: 0 };
    if (o.correct) a.right++;
    else if (o.timeout) a.timeouts++;
    else a.wrong++;
    const w = 2 ** (-Math.max(0, now.getTime() - o.at.getTime()) / 3.6e6 / HALF_LIFE_HOURS);
    a.w += w;
    if (o.correct) a.wRight += w;
    acc.set(k, a);
  }

  const files = new Map<string, MapFile>();
  for (const p of pages) {
    const f = files.get(p.documentId) ?? { documentId: p.documentId, filename: p.filename, pages: [] };
    const a = acc.get(key(p.documentId, p.pageNumber));
    // Smoothed toward ½ so one answer doesn't read as 0% or 100%.
    const score = a ? (a.wRight + 0.5) / (a.w + 1) : null;
    f.pages.push({
      pageNumber: p.pageNumber,
      title: pageTitle(p.contentMd),
      right: a?.right ?? 0,
      wrong: a?.wrong ?? 0,
      timeouts: a?.timeouts ?? 0,
      score,
      status: statusOf(score),
    });
    files.set(p.documentId, f);
  }
  for (const f of files.values()) f.pages.sort((x, y) => x.pageNumber - y.pageNumber);

  const all = [...files.values()].flatMap((f) => f.pages.map((p) => ({ ...p, documentId: f.documentId, filename: f.filename })));
  const weakest = all
    .filter((p) => p.score !== null && p.status !== "solid")
    .sort((a, b) => a.score! - b.score! || b.wrong + b.timeouts - (a.wrong + a.timeouts))
    .slice(0, WEAKEST);
  const answers = obs.length;
  const right = obs.filter((o) => o.correct).length;
  return { files: [...files.values()], weakest, answers, overall: answers ? right / answers : 0 };
}
