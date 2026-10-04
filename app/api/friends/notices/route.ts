import { takeAcceptedNotices } from "@/lib/social/friends";
import { socialRoute } from "@/lib/social/http";

/**
 * Friend requests the caller sent that were accepted since they were last told (#79), and marks
 * them told: each shows as a pop-up once. POST because it changes state. → { accepted: AcceptedNotice[] }
 */
export async function POST() {
  return socialRoute(async (playerId) => ({ accepted: await takeAcceptedNotices(playerId) }));
}
