// Which client screen plays and reveals each Game Mode. One line per Mode: when a Mode's screen
// lands (F24 Apogee/Leap, F25 Pairs/Blitz, F29 Arena), replace its placeholder case below. Every screen
// gets the live RunState (or the Reveal) plus the page context from app/runs/queries.ts.
import { ApogeeRevealScreen } from "@/components/modes/apogee/ApogeeRevealScreen";
import { ArenaRevealScreen } from "@/components/modes/arena/ArenaRevealScreen";
import { ArenaRunScreen } from "@/components/modes/arena/ArenaRunScreen";
import { ApogeeRunScreen } from "@/components/modes/apogee/ApogeeRunScreen";
import { DiveRevealScreen } from "@/components/modes/dive/DiveRevealScreen";
import { DiveRunScreen } from "@/components/modes/dive/DiveRunScreen";
import { LeapRevealScreen } from "@/components/modes/leap/LeapRevealScreen";
import { LeapRunScreen } from "@/components/modes/leap/LeapRunScreen";
import type { Reveal, RunState } from "@/lib/runs/types";
import { modeUi } from "@/lib/ui/modes";
import type { DiveHistory, RunContext } from "../queries";
import { RunClosed } from "../RunClosed";

export function RunScreen({ state, context }: { state: RunState; context: RunContext }) {
  switch (state.mode) {
    case "dive":
      return <DiveRunScreen initial={state} context={context} />;
    case "apogee":
      return <ApogeeRunScreen initial={state} context={context} />;
    case "leap":
      return <LeapRunScreen initial={state} context={context} />;
    case "arena":
      return <ArenaRunScreen initial={state} context={context} />;
    case "pairs": //  F25
    case "blitz": //  F25
      return <ModeComingSoon mode={state.mode} context={context} />;
  }
}

export function RevealScreen({ reveal, context, history }: { reveal: Reveal; context: RunContext; history: DiveHistory }) {
  switch (reveal.mode) {
    case "dive":
      return <DiveRevealScreen reveal={reveal} context={context} history={history} />;
    case "apogee":
      return <ApogeeRevealScreen reveal={reveal} context={context} history={history} />;
    case "leap":
      return <LeapRevealScreen reveal={reveal} context={context} history={history} />;
    case "arena":
      return <ArenaRevealScreen reveal={reveal} context={context} history={history} />;
    case "pairs": //  F25
    case "blitz": //  F25
      return <ModeComingSoon mode={reveal.mode} context={context} />;
  }
}

/** Placeholder until the Mode's own screen ships. */
function ModeComingSoon({ mode, context }: { mode: string; context: RunContext }) {
  const ui = modeUi(mode);
  return (
    <RunClosed
      gameId={context.gameId}
      gameTitle={context.gameTitle}
      title={`${ui.name}: this Mode's screen is coming`}
      body={`${ui.tagline} The run engine is ready; the ${ui.name} screen is still being built.`}
    />
  );
}
