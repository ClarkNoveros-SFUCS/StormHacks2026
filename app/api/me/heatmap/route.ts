import { heatmap } from "@/lib/social/activity";
import { socialRoute } from "@/lib/social/http";

/** The signed-in Player's activity grid: 53 weeks of Vancouver days, gap-filled. → Heatmap */
export async function GET() {
  return socialRoute((playerId) => heatmap(playerId));
}
