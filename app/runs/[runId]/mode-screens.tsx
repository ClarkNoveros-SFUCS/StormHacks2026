// Which client screen plays and reveals each Game Mode. One line per Mode. Every screen
// gets the live RunState (or the Reveal) plus the page context from app/runs/queries.ts.
import { ApogeeRevealScreen } from "@/components/modes/apogee/ApogeeRevealScreen";
import { ArenaRevealScreen } from "@/components/modes/arena/ArenaRevealScreen";
import { ArenaRunScreen } from "@/components/modes/arena/ArenaRunScreen";
import { ApogeeRunScreen } from "@/components/modes/apogee/ApogeeRunScreen";
import { BlitzRevealScreen } from "@/components/modes/blitz/BlitzRevealScreen";
import { BlitzRunScreen } from "@/components/modes/blitz/BlitzRunScreen";
import { DiveRevealScreen } from "@/components/modes/dive/DiveRevealScreen";
import { DiveRunScreen } from "@/components/modes/dive/DiveRunScreen";
import { LeapRevealScreen } from "@/components/modes/leap/LeapRevealScreen";
import { LeapRunScreen } from "@/components/modes/leap/LeapRunScreen";
import { PairsRevealScreen } from "@/components/modes/pairs/PairsRevealScreen";
import { PairsRunScreen } from "@/components/modes/pairs/PairsRunScreen";
import { SlidePanelProvider } from "@/components/results/SlidePanel";
import type { Reveal, RunState } from "@/lib/runs/types";
import type { DiveHistory, RunContext } from "../queries";

export function RunScreen({ state, context }: { state: RunState; context: RunContext }) {
  switch (state.mode) {
    case "dive":
      return <DiveRunScreen initial={state} context={context} />;
    case "apogee": // F24
      return <ApogeeRunScreen initial={state} context={context} />;
    case "leap": //   F24
      return <LeapRunScreen initial={state} context={context} />;
    case "arena":
      return <ArenaRunScreen initial={state} context={context} />;
    case "pairs": //  F25
      return <PairsRunScreen initial={state} context={context} />;
    case "blitz": //  F25
      return <BlitzRunScreen initial={state} context={context} />;
  }
}

/** Every Reveal opens its Evidence links in the slide panel (#75). */
export function RevealScreen(props: { reveal: Reveal; context: RunContext; history: DiveHistory }) {
  return (
    <SlidePanelProvider>
      <ModeReveal {...props} />
    </SlidePanelProvider>
  );
}

function ModeReveal({ reveal, context, history }: { reveal: Reveal; context: RunContext; history: DiveHistory }) {
  switch (reveal.mode) {
    case "dive":
      return <DiveRevealScreen reveal={reveal} context={context} history={history} />;
    case "apogee": // F24
      return <ApogeeRevealScreen reveal={reveal} context={context} history={history} />;
    case "leap": //   F24
      return <LeapRevealScreen reveal={reveal} context={context} history={history} />;
    case "arena":
      return <ArenaRevealScreen reveal={reveal} context={context} history={history} />;
    case "pairs": //  F25
      return <PairsRevealScreen reveal={reveal} context={context} history={history} />;
    case "blitz": //  F25
      return <BlitzRevealScreen reveal={reveal} context={context} history={history} />;
  }
}
