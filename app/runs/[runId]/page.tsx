import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requirePlayer } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getRunState, RunError } from "@/lib/runs/run-engine";
import { getRunContext } from "../queries";
import { RunClosed } from "../RunClosed";
import { RunScreen } from "./mode-screens";

export const metadata: Metadata = { title: "Run · SYLLABYSS" };

// The Run screen. Owner only. Loads the live state (closing anything past its deadline, like
// GET /api/runs/[runId]), so reloading mid-Run resumes where the server says you are, then
// hands it to the Game Mode's client screen (mode-screens.tsx).
export default async function RunPage(props: PageProps<"/runs/[runId]">) {
  const { runId } = await props.params;
  const playerId = await requirePlayer();

  let state;
  try {
    state = await sql.begin((tx) => getRunState(tx, playerId, runId, new Date()));
  } catch (e) {
    if (e instanceof RunError && e.status === 404) notFound();
    throw e;
  }
  if (state.status === "finished") redirect(`/runs/${runId}/reveal`);

  const context = await getRunContext(playerId, runId);
  if (!context) notFound();
  if (state.status === "abandoned") return <RunClosed gameId={context.gameId} gameTitle={context.gameTitle} />;
  return <RunScreen state={state} context={context} />;
}
