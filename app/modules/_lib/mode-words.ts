// How the Modules pages talk about each Game Mode: its best result in its own words, its Prompt
// kinds in plain English, and a gentle "may be too little material" hint. Pure, client-safe.
import { MODES, MODE_IDS, type ModeId, type PromptKind } from "@/lib/modes";

/** A Personal Best in the Mode's metaphor: Dive depth (10 m per point), Apogee altitude (1 km per point), points otherwise. */
export function bestInWords(mode: ModeId, score: number): { label: string; value: string } {
  const n = (x: number) => x.toLocaleString("en-US");
  switch (mode) {
    case "dive":
      return { label: "Deepest dive", value: score > 0 ? `−${n(score * 10)} m` : "0 m" };
    case "apogee":
      return { label: "Highest launch", value: `${n(score)} km` };
    case "leap":
      return { label: "Best climb", value: `${n(score)} pts` };
    case "pairs":
      return { label: "Best table", value: `${n(score)} pts` };
    case "blitz":
      return { label: "Best blitz", value: `${n(score)} pts` };
    default:
      return { label: "Best", value: `${n(score)} pts` };
  }
}

export const KIND_LABEL: Record<PromptKind, string> = {
  open: "Open answers",
  cloze: "Fill the blank",
  definition_to_term: "Name the term",
  ordered_recall: "Put in order",
  odd_one_out: "Odd one out",
  multiple_choice: "Multiple choice",
  true_false: "True or false",
};

/**
 * Below roughly this many parsed pages a Mode may not find enough material for its minimum
 * Prompt count (Pairs needs 12 definitions, Blitz 30 statements). Only a hint: never blocks.
 */
const THIN_PAGES: Record<ModeId, number> = { dive: 3, apogee: 3, leap: 5, pairs: 8, blitz: 10, arena: 5 };

export function thinMaterialHint(mode: ModeId, selectedPages: number, selectedFiles: number): string | null {
  if (selectedFiles === 0 || selectedPages >= THIN_PAGES[mode]) return null;
  const m = MODES[mode];
  const what =
    mode === "pairs"
      ? "12 term–definition pairs"
      : mode === "blitz"
        ? "about 30 true/false statements"
        : mode === "leap"
          ? "10 multiple-choice questions"
          : `${m.minPrompts} prompts`;
  return `${m.name} needs ${what}. ${selectedPages} page${selectedPages === 1 ? "" : "s"} might not be enough; if it fails, add another file and try again.`;
}

/** Modes in their canonical order (the order of MODES). */
export function sortModes<T extends string>(modes: T[]): T[] {
  return [...modes].sort((a, b) => MODE_IDS.indexOf(a as ModeId) - MODE_IDS.indexOf(b as ModeId));
}
