import { sql } from "@/lib/db";
import { dailyRoute } from "@/lib/daily/http";
import { startTodayRun } from "@/lib/daily/queries";

// Play today's Daily Dive: resumes your in-progress Run on it, else starts one. The first Run
// you finish today counts; later ones are practice (`counted: false`). → DailyRunResponse
export async function POST() {
  return dailyRoute("required", (playerId) => sql.begin((tx) => startTodayRun(tx, playerId!, new Date())));
}
