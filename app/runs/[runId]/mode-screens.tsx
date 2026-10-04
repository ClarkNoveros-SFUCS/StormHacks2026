// Which client screen plays and reveals each Game Mode. One line per Mode: when a Mode's screen
// lands (F24 Apogee/Leap, F25 Pairs/Blitz), replace its placeholder case below. Every screen
// gets the live RunState (or the Reveal) plus the page context from app/runs/queries.ts.
import { DiveRevealScreen } from "@/components/modes/dive/DiveRevealScreen";
import { DiveRunScreen } from "@/components/modes/dive/DiveRunScreen";
import type { Reveal, RunState } from "@/lib/runs/types";
import { modeUi } from "@/lib/ui/modes";
import type { DiveHistory, RunContext } from "../queries";
import { RunClosed } from "../RunClosed";

export function RunScreen({ state, context }: { state: RunState; context: RunContext }) {
  switch (state.mode) {
    case "dive":
      return <DiveRunScreen initial={state} context={context} />;
    case "apogee": // F24
    case "leap": //   F24
    case "pairs": //  F25
    case "blitz": //  F25
      return <ModeComingSoon mode={state.mode} context={context} />;
  }
}

export function RevealScreen({ reveal, context, history }: { reveal: Reveal; context: RunContext; history: DiveHistory }) {
  switch (reveal.mode) {
    case "dive":
      return <DiveRevealScreen reveal={reveal} context={context} history={history} />;
    case "apogee": // F24
    case "leap": //   F24
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
