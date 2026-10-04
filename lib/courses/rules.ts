// Course rules: the unlock rule and what a finished Run does to a Topic. Pure and client-safe.
// Spec: docs/architecture/courses.md.
import { MODE_IDS, type ModeId } from "@/lib/modes";
import { passedRun } from "@/lib/modes/rules";
import type { RunSummary } from "@/lib/runs/types";

/** A Player's record on one Topic's Game of one Mode (topic_progress.modes[mode]). */
export type ModeRecord = { best: number; passed: boolean; runs: number };
export type ModeRecords = Partial<Record<ModeId, ModeRecord>>;

/**
 * Which Topics are locked, given which are passed, in Topic order. The first Topic is always
 * unlocked; each later one unlocks once the Topic before it is passed (any of its practice
 * Games). A passed Topic is never locked.
 */
export function lockedTopics(passed: readonly boolean[]): boolean[] {
  return passed.map((p, i) => !p && i > 0 && !passed[i - 1]);
}

/** Where "Continue" goes: the first Topic that is unlocked and not passed, or null if all are passed. */
export function nextTopicIndex(passed: readonly boolean[]): number | null {
  const locked = lockedTopics(passed);
  const i = passed.findIndex((p, j) => !p && !locked[j]);
  return i === -1 ? null : i;
}

/**
 * Folds a finished Run into the Player's per-Mode records for its Topic. `passed` says
 * whether this Run met its Mode's pass bar (F20's passedRun). Records never get worse.
 */
export function recordRun(prev: ModeRecords, summary: RunSummary): { modes: ModeRecords; passed: boolean } {
  const passed = passedRun(summary);
  const old = prev[summary.mode];
  const record: ModeRecord = {
    best: Math.max(old?.best ?? summary.score, summary.score),
    passed: (old?.passed ?? false) || passed,
    runs: (old?.runs ?? 0) + 1,
  };
  return { modes: { ...prev, [summary.mode]: record }, passed };
}

/** Modes in MODES order (dive, apogee, leap, pairs, blitz). */
export function sortModes<T extends { mode: ModeId }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => MODE_IDS.indexOf(a.mode) - MODE_IDS.indexOf(b.mode));
}
