import "server-only";
import { sql } from "@/lib/db";
import type { Db } from "@/lib/progress";
import { FIXTURE_MODEL } from "./fixtures";
import type { SonarModel } from "./types";

// Sonar (F32): the Player's learner model for Python Basics.
// STUB until agent A lands the real one (replay guess_events through lib/sonar/model.ts).
// The signature is the contract: the agent, the API and the bubble all call this.

export async function loadSonarModel(playerId: string, db: Db = sql): Promise<SonarModel> {
  void playerId;
  void db;
  return FIXTURE_MODEL;
}
