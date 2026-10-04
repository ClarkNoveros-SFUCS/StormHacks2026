import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePlayer } from "@/lib/auth";
import { loadGamePage } from "./data";
import { GamePage } from "./GamePage";

export const metadata: Metadata = { title: "Game · SYLLABYSS" };

// /games/[gameId] (F11): your private Game, or a public one (Course practice, Daily Dive).
// Spec: docs/architecture/ui-map.md § Game page.
export default async function GameRoute({ params }: PageProps<"/games/[gameId]">) {
  const playerId = await requirePlayer();
  const { gameId } = await params;
  const data = await loadGamePage(playerId, gameId);
  if (!data) notFound();
  return <GamePage data={data} />;
}
