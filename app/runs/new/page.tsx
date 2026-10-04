import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePlayer } from "@/lib/auth";
import { getPlayerGame } from "@/lib/games/queries";
import { RunClosed } from "../RunClosed";
import { StartRun } from "./StartRun";

export const metadata: Metadata = { title: "New run · SYLLABYSS" };

// /runs/new?game=<gameId>: a launch beat before a Run. Pressing the Mode's Play button (a user
// gesture, which also unlocks sound) creates the Run (POST /api/games/[gameId]/runs) and opens
// it. The Game page (F11) can link here or call runApi.create itself.
export default async function NewRunPage(props: PageProps<"/runs/new">) {
  const { game: gameParam } = await props.searchParams;
  const gameId = typeof gameParam === "string" ? gameParam : null;
  const playerId = await requirePlayer();
  const game = gameId ? await getPlayerGame(playerId, gameId) : undefined;
  if (!game) notFound();
  if (game.status !== "ready") {
    return <RunClosed gameId={game.id} gameTitle={game.title} title="This Game isn't ready yet" body="It's still being made from your notes (or it failed). Check the Game page." />;
  }
  return <StartRun gameId={game.id} gameTitle={game.title} mode={game.mode} />;
}
