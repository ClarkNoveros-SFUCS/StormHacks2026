// Game rows as the API returns them. Client-safe: import these in the UI (F08, F11).
import type { ModeId } from "@/lib/modes";

export type GameStatus = "queued" | "generating" | "ready" | "failed";

export type GameSource = { id: string; filename: string };

export type GameSummary = {
  id: string;
  module_id: string;
  title: string;
  mode: ModeId;
  /** 'queued' and 'generating' both show as "Generating…"; poll until 'ready' or 'failed'. */
  status: GameStatus;
  /** User-facing message when 'failed'. */
  error: string | null;
  prompt_count: number | null;
  created_at: Date;
  /** The Source Documents it was built from, for the file chips. */
  sources: GameSource[];
};
