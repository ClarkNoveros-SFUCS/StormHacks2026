// How the Explore pages word each Mode's pass bar and best result. Pure and client-safe.
import { formatDepth } from "@/components/modes/dive/tiers";
import { BLITZ_PASS_SCORE } from "@/lib/modes/blitz/rules";
import { PASS_SCORE } from "@/lib/modes/dive/rules";
import { LEAP_PASS_CORRECT, LEAP_QUESTIONS } from "@/lib/modes/leap/rules";

/** Short pass-bar text for chips and tiles ("Reach −1,500 m"). The API's `passBar` is the long form. */
export function passLabel(mode: string): string {
  switch (mode) {
    case "dive":
      return `Reach ${formatDepth(PASS_SCORE)}`;
    case "apogee":
      return `Reach ${PASS_SCORE} km`;
    case "leap":
      return `${LEAP_PASS_CORRECT}/${LEAP_QUESTIONS} without falling`;
    case "pairs":
      return "Clear both boards";
    case "blitz":
      return `${BLITZ_PASS_SCORE} points`;
    default:
      return "Pass the bar";
  }
}

/** A best score in the Mode's own unit (Dive depth, Apogee km, points otherwise). */
export function bestLabel(mode: string, best: number | null | undefined): string {
  if (best === null || best === undefined) return "—";
  if (mode === "dive") return formatDepth(best);
  if (mode === "apogee") return `${best.toLocaleString("en-US")} km`;
  return `${best.toLocaleString("en-US")} pts`;
}
