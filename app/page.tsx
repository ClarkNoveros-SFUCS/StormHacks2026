import { redirect } from "next/navigation";
import { Landing } from "@/components/landing/Landing";
import { getDailyTeaser } from "@/components/landing/daily-teaser";
import { getApiPlayer } from "@/lib/auth";
import { dailyToday } from "@/lib/daily/queries";

// The landing page for signed-out visitors (F19 #32). Signed-in Players go to their dashboard.
// getApiPlayer() returns null when signed out (and honours the dev bypass under `next dev`).
export default async function LandingPage() {
  if (await getApiPlayer()) redirect("/home");
  // Today's real puzzle (signed out: no `me`); the sample if the Daily is unavailable.
  const daily = await dailyToday(null).catch(() => null);
  return <Landing teaser={getDailyTeaser(daily)} />;
}
