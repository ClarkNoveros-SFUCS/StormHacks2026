// Apogee is Dive in space: the same generator, rules and scoring, shared rather than copied.
// Only its id, name and UI (altitude in km, Troposphere/Orbit/Lunar/Deep Space, LAUNCH,
// MISSION REPORT) differ; see MODES.apogee in lib/modes/index.ts and docs/design/modes/apogee.md.
export { diveGenerator as apogeeGenerator } from "../dive/generate.ts";
export * as apogeeRules from "../dive/rules";
