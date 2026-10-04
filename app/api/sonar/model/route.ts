import { getApiPlayer } from "@/lib/auth";
import { loadSonarModel } from "@/lib/sonar/queries";

// Sonar (F32): the signed-in Player's learner model for Python Basics. → SonarModel
export async function GET() {
  const playerId = await getApiPlayer();
  if (!playerId) return Response.json({ error: "Not signed in" }, { status: 401 });
  return Response.json(await loadSonarModel(playerId));
}
