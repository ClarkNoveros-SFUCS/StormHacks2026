import { dailyRoute } from "@/lib/daily/http";
import { dailyToday } from "@/lib/daily/queries";

// Today's Daily Dive: number, title, the first Prompt as a teaser, the countdown target and,
// signed in, your status, result and streaks. Works signed out (the landing page teaser).
// → { daily: DailyToday }; 404 when there's no puzzle today.
export async function GET() {
  return dailyRoute("optional", async (playerId) => {
    const daily = await dailyToday(playerId);
    return daily && { daily };
  }, "There's no Daily Dive today");
}
