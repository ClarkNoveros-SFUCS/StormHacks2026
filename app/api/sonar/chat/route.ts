import { getApiPlayer } from "@/lib/auth";
import { runSonar } from "@/lib/sonar/agent";
import { parseChatRequest } from "@/lib/sonar/chat-request";
import type { ChatResponse } from "@/lib/sonar/types";

// POST /api/sonar/chat (F32): one Sonar turn. Body { message?, context: { path }, chatId? }; no message =
// the briefing. chatId picks the saved chat's memory thread. The page context is re-derived from context.path on the server.
// Spec: docs/architecture/sonar.md § Decisions.

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const playerId = await getApiPlayer();
  if (!playerId) return Response.json({ error: "Not signed in" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseChatRequest(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  try {
    const res: ChatResponse = await runSonar({
      playerId,
      message: parsed.message,
      context: parsed.context,
      chatId: parsed.chatId,
    });
    return Response.json(res);
  } catch (e) {
    console.error("[sonar/chat]", e);
    return Response.json({ error: "Sonar lost the signal. Try again." }, { status: 502 });
  }
}
