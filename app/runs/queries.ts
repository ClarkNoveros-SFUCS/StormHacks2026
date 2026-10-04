import "server-only";
import { sql } from "@/lib/db";
import { isUuid } from "@/lib/documents/queries";
import type { ModeId, PromptOutcome } from "@/lib/runs/types";

// Page-level reads for /runs/** that the Run API doesn't carry: the Game's title and Module
// (for links), what happened on Prompts already closed (so a reload redraws the progress
// squares), and this Player's dive history on the Game (Reveal: DIVE #N, distribution).

export type RunContext = {
  runId: string;
  gameId: string;
  gameTitle: string;
  moduleId: string;
  mode: ModeId;
  /** Closed Prompts of this Run, by position. */
  closed: { position: number; outcome: PromptOutcome; points: number }[];
};

/** The caller's Run with its Game, or null (treat as 404). */
export async function getRunContext(playerId: string, runId: string): Promise<RunContext | null> {
  if (!isUuid(runId)) return null;
  const [row] = await sql<{ game_id: string; title: string; module_id: string; mode: ModeId }[]>`
    SELECT r.game_id, g.title, g.module_id, g.mode
      FROM runs r JOIN games g ON g.id = r.game_id
     WHERE r.id = ${runId} AND r.player_id = ${playerId}`;
  if (!row) return null;
  const closed = await sql<{ position: number; outcome: PromptOutcome; points: number }[]>`
    SELECT position, outcome, points FROM run_prompts
     WHERE run_id = ${runId} AND outcome IS NOT NULL ORDER BY position`;
  return { runId, gameId: row.game_id, gameTitle: row.title, moduleId: row.module_id, mode: row.mode, closed: [...closed] };
}

export type DiveHistory = {
  /** This Run's number among the Player's finished Runs on the Game (1-based). */
  number: number;
  /** Scores of the Player's finished Runs on the Game up to and including this one, oldest first. */
  scores: number[];
};

/** The Player's finished Runs on this Game, up to this one (so an old Reveal shows what was true then). */
export async function getDiveHistory(playerId: string, gameId: string, runId: string): Promise<DiveHistory> {
  const rows = await sql<{ id: string; score: number }[]>`
    SELECT r.id, r.score FROM runs r
     WHERE r.player_id = ${playerId} AND r.game_id = ${gameId} AND r.status = 'finished'
       AND r.finished_at <= (SELECT finished_at FROM runs WHERE id = ${runId})
     ORDER BY r.finished_at, r.id`;
  const index = rows.findIndex((r) => r.id === runId);
  return { number: index === -1 ? rows.length + 1 : index + 1, scores: rows.map((r) => r.score) };
}
