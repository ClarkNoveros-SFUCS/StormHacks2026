// Sonar (F32, #73): the shapes every part of Sonar shares. Client-safe: no server imports.
// Spec: docs/architecture/sonar.md. Changing a shape here is a contract change: tell the lead.

import type { ModeId } from "@/lib/modes";

export type ConceptStatus = "mastered" | "learning" | "weak" | "unseen";

/** One Concept of the Python Basics graph (db/seed/courses/python-basics.sonar.json). */
export type Concept = {
  id: string;
  name: string;
  topicSlug: string;
  summary: string;
  /** Pages of the Topic's reading that teach it (1-based). */
  pages: number[];
};

/** A Concept with this Player's mastery. Every number is 0–1. */
export type ConceptState = Concept & {
  /** BKT probability the Concept is known, after the last observation. */
  p: number;
  /** p after forgetting: p · 2^(−hours since lastSeen / 72). What the UI shows. */
  pEff: number;
  /** Observations (guesses) that touched it. */
  n: number;
  right: number;
  wrong: number;
  lastSeen: string | null;
  status: ConceptStatus;
  /** Share of the blame for the Player's last 10 misses (0 when none). */
  blame: number;
};

/** "Course says / Sonar says" for one Topic. */
export type TopicView = {
  slug: string;
  number: number;
  title: string;
  /** The Course's linear unlock: a Practice Game of this Topic was Passed. */
  coursePassed: boolean;
  /** Mean pEff of the Topic's Concepts, 0–1 (0 when all unseen). */
  sonarMastery: number;
};

export type RootCause = {
  conceptId: string;
  /** Its share of the blame for the last 10 misses, 0–1. */
  blameShare: number;
  /** The Concepts the misses were on, which depend on the root cause. */
  missedOn: string[];
  /** How many of the last 10 misses it took blame for. */
  misses: number;
};

/** Who chose an action: the deterministic planner (ranked) or the Sonar agent (its own pick). */
export type ActionSource = "planner" | "sonar";

export type Action =
  | {
      kind: "play";
      gameId: string;
      mode: ModeId;
      title: string;
      conceptId: string | null;
      topicSlug: string | null;
      /** One line, shown on the card. */
      why: string;
      source: ActionSource;
      /** 0–2 for a planner action, null for Sonar's own pick. */
      rank: number | null;
    }
  | {
      kind: "create_game";
      /** Confirm first: the client calls POST /api/modules/[moduleId]/games with these. */
      moduleId: string;
      sourceDocumentIds: string[];
      mode: ModeId;
      title: string;
      why: string;
      source: "sonar";
    }
  | { kind: "read"; href: string; title: string; why: string; source: ActionSource };

export type SonarModel = {
  courseSlug: "python-basics";
  concepts: ConceptState[];
  /** [prerequisite, concept] */
  edges: [string, string][];
  topics: TopicView[];
  rootCause: RootCause | null;
  /** The planner's top 3, best first. */
  actions: Action[];
  /** Guesses replayed. 0 = a new Player. */
  observations: number;
};

/** Where the Player is when they talk to Sonar, worked out from the URL (lib/sonar/context-path.ts). */
export type PageContext = {
  kind: "home" | "explore" | "course" | "topic" | "module" | "modules" | "game" | "reveal" | "daily" | "sonar" | "other";
  path: string;
  courseSlug?: string;
  topicSlug?: string;
  moduleId?: string;
  gameId?: string;
  runId?: string;
};

/** One wrong guess or timeout, for the agent and the UI. */
export type Mistake = {
  at: string;
  gameId: string;
  gameTitle: string;
  mode: ModeId;
  promptId: string;
  prompt: string;
  /** What the Player typed or chose; "(timeout)" for a timeout. */
  answered: string;
  correct: string;
  explanation: string | null;
  evidence: { documentId: string; documentTitle: string; pageNumber: number; quote: string | null } | null;
  /** Empty outside Python Basics. */
  conceptIds: string[];
};

// API: POST /api/sonar/chat
export type ChatRequest = { message?: string; context: PageContext };
export type ChatResponse = { reply: string; actions: Action[] };

// API: GET /api/sonar/bubble?path=<pathname>. Templated from the model, no LLM, fast.
export type Bubble = { text: string; tone: "nudge" | "alert" | "cheer"; prompt: string } | null;
export type BubbleResponse = { bubble: Bubble };

// API: GET /api/sonar/model → SonarModel
