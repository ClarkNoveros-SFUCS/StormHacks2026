// Shapes the Modules pages pass from server to client. Client-safe.
import type { GameSummary } from "@/lib/games/types";
import type { ModeId } from "@/lib/modes";

export type ModuleCardData = {
  id: string;
  name: string;
  fileCount: number;
  gameCount: number;
  /** Distinct Modes of its Games, in MODES order. */
  modes: ModeId[];
  /** The highest-scoring finished Run across its Games, shown in that Game's Mode's words. */
  best: { score: number; mode: ModeId; title: string } | null;
  lastPlayed: string | null;
  createdAt: string;
};

export type DocStatus = "uploaded" | "parsing" | "parsed" | "failed";

/** A Source Document row as `GET /api/modules/[id]/documents` returns it. */
export type DocRow = {
  id: string;
  module_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  status: DocStatus;
  error: string | null;
  page_count: number | null;
  created_at: string | Date;
};

/** Progress shown on a Game card. */
export type CardProgress = {
  personalBest: number;
  masteryPct: number;
  runs: number;
};

/** `GET /api/documents/[documentId]/pages`. */
export type DocumentPages = {
  document: { id: string; filename: string; pageCount: number };
  pages: { pageNumber: number; contentMd: string }[];
};

/** A Game card's data: `GameSummary` with `created_at` as an ISO string (JSON-safe both ways). */
export type GameRow = Omit<GameSummary, "created_at"> & { created_at: string };

/** A file still being sent to the server (before it has a row). */
export type UploadItem = {
  key: string;
  filename: string;
  size: number;
  progress: number;
};
