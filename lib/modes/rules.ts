// Each Mode's pass bar behind one function, for Courses (F22) and badges (F21). Pure and
// client-safe. A Mode's own rules live in lib/modes/<mode>/rules.ts.
import type { RunSummary } from "@/lib/runs/types";
import * as blitz from "./blitz/rules";
import * as dive from "./dive/rules";
import * as leap from "./leap/rules";
import * as pairs from "./pairs/rules";

/** Whether a finished Run meets its Mode's pass bar. */
export function passedRun(summary: RunSummary): boolean {
  switch (summary.mode) {
    case "dive":
    case "apogee":
      return dive.passed(summary);
    case "leap":
      return leap.passed(summary);
    case "pairs":
      return pairs.passed(summary);
    case "blitz":
      return blitz.passed(summary);
  }
}

/** The pass bar in words, for the Topic page. */
export const PASS_BAR_TEXT: Record<RunSummary["mode"], string> = {
  dive: `Score ${dive.PASS_SCORE} or more`,
  apogee: `Score ${dive.PASS_SCORE} or more`,
  leap: `Get ${leap.LEAP_PASS_CORRECT} of ${leap.LEAP_QUESTIONS} right without falling`,
  pairs: `Clear both boards`,
  blitz: `Score ${blitz.BLITZ_PASS_SCORE} or more`,
};
