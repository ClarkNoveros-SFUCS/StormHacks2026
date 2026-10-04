import type { Metadata } from "next";
import { SonarPageClient } from "@/components/sonar/SonarMap";
import { requirePlayer } from "@/lib/auth";
import { loadSonarModel } from "@/lib/sonar/queries";

export const metadata: Metadata = { title: "Sonar · SYLLABYSS" };

// Sonar's mastery map (F32, #73): the Player's learner model for Python Basics, drawn as a
// sonar chart of the Concept DAG with the root cause, the blame path and the planner's picks.
// Chat lives in the floating buddy drawer (components/sonar/SonarBuddy.tsx).
export default async function SonarPage() {
  const playerId = await requirePlayer();
  const model = await loadSonarModel(playerId);
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <SonarPageClient model={model} />
    </main>
  );
}
