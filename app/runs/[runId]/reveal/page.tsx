import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requirePlayer } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getReveal, RunError } from "@/lib/runs/run-engine";
import { getDiveHistory, getRunContext } from "../../queries";
import { RevealScreen } from "../mode-screens";

export const metadata: Metadata = { title: "Results · SYLLABYSS" };

// The Reveal: every Prompt's Answers and Evidence, Personal Best and Mastery. Owner only;
// an unfinished Run goes back to its Run screen. The Mode's screen is picked in mode-screens.tsx.
export default async function RevealPage(props: PageProps<"/runs/[runId]/reveal">) {
  const { runId } = await props.params;
  const playerId = await requirePlayer();

  let reveal;
  try {
    reveal = await sql.begin((tx) => getReveal(tx, playerId, runId));
  } catch (e) {
    if (e instanceof RunError && e.status === 404) notFound();
    if (e instanceof RunError && e.status === 409) redirect(`/runs/${runId}`);
    throw e;
  }

  const context = await getRunContext(playerId, runId);
  if (!context) notFound();
  const history = await getDiveHistory(playerId, context.gameId, runId);
  return <RevealScreen reveal={reveal} context={context} history={history} />;
}
