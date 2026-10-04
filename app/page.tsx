import { redirect } from "next/navigation";
import { Landing } from "@/components/landing/Landing";
import { getDailyTeaser } from "@/components/landing/daily-teaser";
import { getApiPlayer } from "@/lib/auth";

// The landing page for signed-out visitors (F19 #32). Signed-in Players go to their dashboard.
// getApiPlayer() returns null when signed out (and honours the dev bypass under `next dev`).
export default async function LandingPage() {
  if (await getApiPlayer()) redirect("/home");
  return <Landing teaser={getDailyTeaser()} />;
}
