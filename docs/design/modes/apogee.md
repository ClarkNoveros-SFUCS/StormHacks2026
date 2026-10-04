# Apogee: Dive in space

Rules and words from F20; the look and the screens from F24 (`components/modes/apogee/`), a React + three.js port of `inspo/krillion-space-variant/apogee.html`. Decisions: `docs/worklog/aaf1007/overnight-decisions.md` §4, Q21.

## Rules

Exactly Dive's (`docs/architecture/run-and-scoring.md` § Dive and Apogee): 7 Prompts, 25 s each, −3 s per wrong typed guess, one try for put-in-order and odd-one-out, Hints drop a Tier, Staleness on Open Prompts. Same generator, same Prompts kinds, same points. `RunState.mode` is `"apogee"`; everything else in the state, results and Reveal is Dive's shape (`DiveRunState`, `DiveReveal`).

**Pass bar:** score ≥ 150.

## Words

| Thing | Word |
|---|---|
| Play button | **LAUNCH** |
| Score | altitude in **km** (1 point = 1 km, so the max 700 points = 700 km) |
| Tiers (common → rare) | **Troposphere** (10) · **Orbit** (25) · **Lunar** (60) · **Deep Space** (100) (`MODES.apogee.bands`) |
| Results screen title | **MISSION REPORT** |
| A wrong guess | "Off course −3 s" |
| Timeout | "Lost signal" |
| Mascot | a pixel rocket |
| Accent | `#9d7bff` (violet), from `MODES.apogee.accent` |

**CHECK:** km per point is a guess (Dive uses 10 m per point); the UI lane may scale it for drama, as long as the number shown stays proportional to the score. F24 kept **1 km per point** (see the altitude scale below).

In the screens the accent is the inspo's **flame orange `#ff6a2b`** (the rocket's exhaust); `MODES.apogee.accent` violet is still what tiles and badges outside the Run use. Tier colours: Troposphere `#a9b8d6`, Orbit `#4fd6e8`, Lunar `#a98bff`, Deep Space `#ffcf4a`.

## Look (F24)

Space, one dark look. Theme `[data-theme="apogee"]` (`components/modes/apogee/apogee.css`, scoped `.ap-root`): void `#04050c`, frosted-glass panels (`.ap-glass`: translucent navy, 1 px cool border, 14 px radius, backdrop blur), hull white `#ece6d8` text, dim `#8b93b3`. Type: **Big Shoulders Stencil** (display: APOGEE, altitude, tier names, buttons) and **IBM Plex Mono** (telemetry, chips, eyebrows), both via `next/font` in `fonts.ts`; body stays Mulish. The shared round/results blocks (OptionGrid, OrderList, ResultList, BandTable) are restyled into glass rows inside `.ap-root`.

## The world (`scene.ts`, three.js)

A port of the inspo scene: shader sky dome that fades from day to space with altitude, 6,000 twinkling stars, a procedural Earth with clouds, city lights and an atmosphere rim, the pad with its lattice tower and beacon, the lathe-built rocket (stencilled APOGEE) with a shader flame, fire/smoke/spark particles and an engine light, low cloud puffs, meteors in the mesosphere, speed streaks, bloom. Landmarks on the way up: the Kármán line halo, the ISS orbiting, the geostationary ring with satellites, the Moon, Webb at L2, Mars, the asteroid belt and Jupiter, each with a canvas label that fades in near its altitude.

**Altitude scale.** 1 point = 1 km, so the number on screen is the score. World y = 10 + 2 × points. Up to the ISS every landmark sits at its real altitude (Tropopause 12, Stratopause 50, Mesopause 85, **Kármán line 100**, low orbit 160, **ISS 408**). Real distances beyond that don't fit in 700 km, so the deep-space stops are on a stylised scale: **Geostationary 460, Moon 530, L2 590, Mars 650, Jupiter 700**; their toasts and 3D labels give the real distance ("real: 384,400 km"). Defined in `altitude.ts` (`LANDMARKS`).

**Camera.** Orbits slowly around the rocket, follows it up with a spring, shakes on burns; drag to look around, wheel/pinch to zoom, double-click resets. On the pad it frames the rocket and tower; in flight it looks a little below the rocket so the rocket rides above the console.

## Run screen (`ApogeeRunScreen.tsx`)

- **Top HUD:** menu tile, APOGEE wordmark + Game title (left); 7 progress pips coloured by the Tier scored, red for a miss (centre); telemetry (right): live altitude `185 km` (animates with the rocket), the zone (`Past the Kármán line`), points, mute.
- **Altitude ruler** (right edge): landmarks from the pad to Jupiter, a flame fill and diamond marker at the live altitude; labels on desktop, ticks only on phones.
- **Intro** (a fresh Run): glass panel with APOGEE, the pitch, rules (7 · 25 s · −3 s) and the Tier ladder (10/25/60/100 km), **LAUNCH** (Enter). Then **3 · 2 · 1 · LIFTOFF**: the engines spool up on "1" and the rocket leaves the pad.
- **Console** (bottom centre, glass): `2 / 7 · FILL THE BLANK` + Tier chip (open Prompts show all four), the clock (`14.5`, red under 6 s) and a flame time bar, the Prompt (blanks drawn as a flame underline), the hint line, then the input + **FIRE** (typed kinds), the 2×2 options (odd one out, keys 1–4) or the order list + **Lock in order**; feedback line and **Hint** with its cost (`Lunar → Orbit`). It slides up for each Prompt; the clock starts (POST start-prompt) once it's in.
- **Correct:** engine burn (shockwave ring and sparks in the Tier colour, camera shake), `+60` pops over the rocket's nose, the rocket climbs; passing a landmark shows a toast (`Kármán line · 100 km · Space begins`). Then the **tier reveal** (the catch moment): the Tier icon glowing, the Tier name huge in stencil (`LUNAR`), the answer, `+60 KM · 245 km up`, a verdict, **CONTINUE ▲** (Enter, auto after 6 s; the last says MISSION REPORT). The clock is paused because start-prompt only runs after it.
- **Wrong typed guess:** "Off course −3 s" pop, console shake, engine sputter. **One-shot miss:** "Off course · It was X" with the right option/order marked. **Timeout:** "Lost signal", the engines idle.
- **End:** "MISSION COMPLETE · downlinking telemetry…", the rocket coasts, then the Reveal.

## Mission Report (`ApogeeRevealScreen.tsx`)

The camera pulls back to show the whole climb with a dashed trajectory; the report slides in from the right (a bottom sheet on phones). Contents: NEW PERSONAL BEST badge, `Mission report · flight #N`, the altitude in big stencil, a verdict ("You climbed past low Earth orbit. 233 more km reaches the ISS."), Topic passed banner (Course Games), stats (points, prompts scored, Mastery before→after), **LAUNCH AGAIN** / Explore the flight / Back to Game, the distribution of your flights, the **MISSION LOG** chart (one burn per Prompt, higher = rarer), Mastery meter, **MISSION BANDS** (Suborbital 0–150 · Orbit 151–300 · Lunar 301–500 · Deep space 501–700), and the **FLIGHT LOG**: every Prompt with every Answer, its Tier and Evidence (links into the Module's file viewer). **Explore the flight** hides the report; drag the ruler (or ↑↓ on it, or wheel) to fly the camera back through the trip; the PB line sits on the ruler.

## Motion and performance

60 fps target; device pixel ratio capped at 2; the scene pauses while the tab is hidden and disposes every geometry, material, texture and the WebGL context on unmount; three.js loads with a dynamic import (not in the first bundle, never on the server). Reduced motion: no shake, no camera orbit drift, no speed streaks or meteors, the climb eases straight to the new altitude, CSS animations off. Without WebGL the Run still plays over a static gradient.
