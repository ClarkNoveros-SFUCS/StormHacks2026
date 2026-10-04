# Design system: two worlds

SYLLABYSS has **two visual worlds**. The **site** (the "house": landing, home, Explore, Modules, profiles, leaderboards) has one look: dark night-navy, pixel headings, chunky rounded cards, yellow pixel CTAs, and a living, reactive pixel world around it. **Mode screens** (a Run and its Reveal) belong to the Game Mode: each Mode brings its own **theme** through `data-theme`. The first Mode, **Dive**, keeps the Krillion look and is specified in [`modes/dive.md`](./modes/dive.md); add one file per new Mode next to it.

Spec of record for this direction: `docs/worklog/aaf1007/overnight-decisions.md` §1–3, §12–14. Structure and content per route: `docs/architecture/ui-map.md`. How Modes plug into generation and play: `docs/architecture/game-modes.md`.

Codedex is a reference, not the target. Anton's brief (§14): the site must be **visually stunning, full of character and as interactive as possible**. Every page should feel alive: a world, not flat panels.

**Mock:** open `docs/design/mock/index.html` in a browser (no build step, works from `file://`). Use the buttons at the bottom left, or add `#landing`, `#home`, `#modules`, `#module`, `#game`, `#run` or `#reveal` to the URL.

| Mock file | Holds | Spec |
|---|---|---|
| `mock/core/system.css`, `core/system.js` | Site tokens, recipes, components, motion, synthesized sound, registries | this file |
| `mock/core/prompt-kinds.js` | Matching and the inputs for each Prompt kind, shared by Modes | §6 |
| `mock/themes/ocean.js` | The tall ocean depth world (Dive's scene) | `modes/dive.md` §5 |
| `mock/modes/dive/` | Dive's theme, Run with real descent and the catch screen, Reveal column | `modes/dive.md` |
| `mock/themes/sky.js` | The site's living sky backdrop (stars, moon, parallax clouds, birds, time-of-day tint; sky → ocean on landing scroll) | §2.5 |
| `mock/app/site.css`, `app/site.js` | Site pieces: mascot, pixel avatars, profile card, odometers, streak flame, heatmap, Mode tile mini-scenes, tilt cards, XP bar, confetti, flip clock | §2, §6.1, §8 |
| `mock/app/shell.js` | Site shell: landing, home, Modules, Module page, New Game dialog, Game page frame | §7 |

Mock extras: `index.html?autoplay#run` plays a Dive by itself through to the Reveal; `?tod=day|dusk|night` forces the sky tint.

**Live reference in the app:** `/styleguide` (dev only, `notFound()` in production) renders every component below, and `/styleguide/dive` is a **Dive playground** that runs a fake 7-Prompt Dive client-side with the full descent and catch flow.

When the mock, the styleguide and these docs disagree, the docs win.

## 1. Two worlds

| World | Where | Feel | Fonts | Corners |
|---|---|---|---|---|
| **Site** | `/`, `/home`, `/explore…`, `/daily`, `/leaderboard`, `/friends`, `/u/[username]`, `/modules…`, `/games/[id]` frame | Codedex-like but alive: night-navy, chunky cards with hover lift and tilt, yellow pixel CTAs, pixel sprites, XP/levels/streaks/badges, mascot that reacts | Pixelify Sans (headings, buttons), Mulish (body), VT323 for big numbers | `--r` 10 px cards, stepped pixel buttons |
| **Mode screens** | `/runs/[id]`, `/runs/[id]/reveal`, and the Mode's stats block on the Game page | owned by the Mode's theme (`data-theme="<mode>"`) | the theme's (`dive`: VT323 everywhere) | the theme's (`dive`: none, two-ring pixel borders) |

What stays the same in both worlds, so it still feels like one product:
- **The token names** (§4). A theme overrides values, never names.
- **The motion vocabulary** (§5): the same keyframes, easings, spring and particles.
- **Sound events** (§5.3): the same synthesized engine; a theme can pitch or voice them differently.
- **The round loop** for Modes (§6): HUD → card → play area → input dock, ending in a results column built from the same blocks.
- **Accessibility and mobile rules** (§9, §10).

## 2. The site look

### 2.1 Palette

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0a0d1c` | page |
| `--bg-2` | `#0f1326` | inputs, sunken areas, dialogs |
| `--surface` | `#141a33` | cards, panels |
| `--surface-2` | `#1b2242` | raised: secondary buttons, card headers, tooltips |
| `--border` | `#2a3358` | 1 px card borders, hairlines |
| `--border-strong` | `#3b4675` | hover borders, the stepped pixel frame |
| `--ink` | `#05070f` | dark outline of pixel buttons |
| `--text` | `#eef2ff` | body text |
| `--muted` | `#9aa6c8` | secondary text |
| `--faint` | `#6b7699` | captions, disabled, axis labels (≥ 13 px only) |
| `--primary` / `--primary-text` / `--primary-drop` | `#ffd84d` / `#1a1405` / `#b8941f` | the yellow CTA, its text and its bevel |
| `--accent` | `#ff5d8f` | brand coral-pink: logo shadow, highlights, Dive score |
| `--signal` | `#4de3ff` | live info: focus ring, links, timers, progress, heatmap |
| `--reward` | `#ffd166` | XP, stars, Personal Best, top band |
| `--violet` | `#9d7bff` | badges (gem), levels, secondary accent |
| `--success` / `--danger` / `--caution` | `#3ddc97` / `#ff5c5c` / `#ff9f43` | passed, failed/destructive, hints and warnings |
| `--band-1…4`, `--band-miss` | `#8fa3c4` `#4de3ff` `#9d7bff` `#ffd166` `#3d4f6e` | scoring tiers, lowest → highest, plus a miss |
| `--heat-0…4` | `#171d38` → `#7af0ff` | heatmap intensity levels |

Tints are derived, never hard-coded: `color-mix(in srgb, var(--signal) 25%, transparent)`.
**Dark only** for now (Codedex is dark; light mode is deferred, §12).

### 2.2 Type

Loaded with `next/font/google` in `app/layout.tsx` as CSS variables (`--font-pixelify`, `--font-mulish`, `--font-vt323`), then mapped to the raw tokens `--f-display`, `--f-body`, `--f-hud` and the Tailwind families `font-display`, `font-sans`, `font-hud`.

| Role | Font | Size | Notes |
|---|---|---|---|
| Logo | Pixelify Sans 700 | sm 20 px · md 36 px · lg `clamp(48px, 10vw, 104px)` | chromatic shadow: `+N px var(--accent)`, `−N px var(--signal)`; `title-flicker` |
| Page title (h1) | Pixelify Sans 600 | 32–40 px | |
| Section title (h2) | Pixelify Sans 600 | 22–24 px | |
| Card title (h3) | Pixelify Sans 600 | 17–18 px | |
| Button | Pixelify Sans 600 | 13 / 15 / 18 px (sm/md/lg) | `.02em` tracking |
| Label | Pixelify Sans | 13 px uppercase, `.2em` | `.label-line`: dashed hairline to the right |
| Body | Mulish 400 | 15 px, line-height 1.55 | never smaller than 15 px for reading text |
| Small | Mulish | 13 px | muted |
| Big numbers (XP, scores, countdowns) | VT323 | 32–96 px, `tabular-nums` | rolled by `<Odometer>` |

### 2.3 Radius and spacing

`--r-sm` 6 px (chips, inputs, tooltips) · `--r` 10 px (cards, panels) · `--r-lg` 16 px (hero banners, dialogs). Tailwind: `rounded-sm`, `rounded-md`, `rounded-lg`. Pixel buttons and the pixel frame have **no** radius: their stepped corners come from edge shadows. Page gutter 16 px on mobile, 24 px from `sm`; content max width 1152 px (`max-w-6xl`); card padding 16–20 px; grid gaps 12–16 px.

### 2.4 Recipes (`app/globals.css`)

| Class | What |
|---|---|
| `.px-btn[data-variant="primary\|secondary\|ghost\|danger"]` | Pixel button: stepped corners from four 2 px edge shadows in `--ink`, a 4 px inner bevel, a top highlight and a hard drop shadow. Hover lifts 2 px and deepens the drop; `:active` squashes (`scale(1.03, .94)`, drop 1 px) and releases on `--ease-bounce` (spring). Primary is the yellow CTA. |
| `.px-frame` | A stepped 2 px border in `--frame` (default `--border-strong`), for the profile card and HUD plates. |
| `.card` + `data-interactive="true"` | Surface, 1 px border, `--r`. Interactive: hover lifts −3 px, border brightens, soft signal glow (`--glow`). |
| `.label-line` | Section label with a dashed hairline. |
| `.shine` | A white sweep that crosses the element every 2.8 s (XP bars, badges, gold chips). |
| `.stagger` | Children `rise-in` with a 60 ms stagger (set `--i` per child). |
| `.glow-signal`, `.glow-accent` | Coloured text with a soft glow (HUD numbers). |
| `.pixelated` | `image-rendering: pixelated; shape-rendering: crispEdges`. |
| `.dv-px`, `.dv-panel`, `.dv-crt` | Dive's Krillion recipes (two-ring pixel border with drop, scanlined panel, CRT overlay). Use inside `[data-theme="dive"]`. |

### 2.5 Interaction catalogue (§14: go beyond Codedex)

Everything here is off or reduced under `prefers-reduced-motion` (§5.4). **F10** = shipped as a component in this feature; later features place it on pages.

| Idea | What it does | Where | Built in |
|---|---|---|---|
| **Living backdrop** | A full-viewport pixel sky/ocean canvas: drifting clouds, twinkling stars, birds, rising bubbles; tint follows local time (day / dusk / night); cursor parallax on layers | every site page, behind content; the landing turns sky into ocean as you scroll | F10 `SkyBackdrop`; landing scroll-to-ocean in F19 |
| **Mascot with character** | The pixel anglerfish blinks, its eyes follow the cursor, it bobs, it speaks in a speech bubble, reacts `happy` / `sad` / `wow`, falls asleep (Zzz) when idle, wakes on hover; clicking it plays a reaction | greetings, empty states, streak reminders, level-ups | F10 `Mascot`; placements in F19/F26–F28 |
| **Tactile buttons** | Squash on press, spring on release, hover lift, UI blip sounds | everywhere | F10 `Button` |
| **Tilt cards with glare** | Cards tilt in 3D toward the cursor (max ~8°) with a moving glare highlight; settle back on a spring | course cards, Mode tiles, Daily card | F10 `TiltCard` |
| **Mode tile mini-scenes** | Each Mode tile plays a looping pixel scene on hover/focus (Dive: diver sinking past fish; Apogee: rocket lifting off; Leap: hopper jumping platforms; Pairs: cards snapping together; Blitz: neon T/F flashing; Arena: locked crosshair) | New Game dialog, landing, Topic practice panel | F10 `ModeTile` |
| **Odometer numbers** | Digits roll like a mechanical counter to the new value | XP, scores, counts | F10 `Odometer` |
| **XP bar shine + sparks** | Fill springs to the new value with a shine sweep; pixel sparks fly off the leading edge while it grows | home sidebar, profile card, Reveal | F10 `XpBar` |
| **Badges flip and gleam** | Earned badges flip once on reveal (`badge-flip`) and catch a shine on hover; locked ones are a dim silhouette with a lock | profile, Topic pass, sidebar | F10 `Badge` |
| **A real flame** | The streak flame flickers (`flame-flicker`) with layered pixel tongues; grey and still when today isn't played yet | nav, profile card, home | F10 `StreakFlame` |
| **Moments** | Level-up and Topic pass: full-screen pixel confetti (`confettiRain`) + a banner (`banner-in`) + `sfx.levelUp()` | Reveal, Topic page | F10 primitives; wiring in F26/F27 |
| **Heatmap ripple** | Cells ripple in from the newest day outward on load; tooltips show the date and activity | profile | F10 `Heatmap` |
| **FLIP leaderboard rows** | Rows animate to their new rank (measure → invert → play on a spring) | `/leaderboard`, `/daily` | F26/F28 (use `spring` from `lib/motion`) |
| **Flip-clock countdown** | Daily countdown digits flip like a split-flap clock | `/daily`, home Daily card | F28 (Odometer pattern) |
| **Page transitions** | Each route fades and rises in (`page-in`) | every site page | F10 `PageTransition` |
| **Sound** | Soft blips on hover/click, chimes on rewards, all synthesized (§5.3), one mute toggle | everywhere | F10 `sfx`, `SoundToggle` |
| **Easter eggs** | Clicking the mascot plays a reaction; the Konami code drops a tiny fishing mini-game | site-wide | mascot click in F10; Konami in F19 (keep it cheap) |

Budget: 60 fps on a mid laptop, no heavy assets (SVG/canvas pixel art; three.js only inside Modes that need it).

### 2.6 Nav (signed in)

Logo · Explore · My Modules · Daily · Leaderboard — right side: streak flame + count, XP/level chip, mute toggle, avatar (Clerk `UserButton` with Profile and Friends links). On mobile the links collapse into a menu sheet (`Drawer side="bottom"`). F10 ships only a minimal header (Logo, `SoundToggle`, `UserButton`); the full nav is F19 (#32).

## 3. Mode themes (`data-theme`)

A **theme** is everything a Mode may change. Set `data-theme="<mode>"` on the Mode screen's root; the `[data-theme="<mode>"]` block in `app/globals.css` overrides the token values, and every component inside picks them up (Tailwind utilities resolve through `@theme inline`, so `bg-surface` follows the theme).

| A theme may provide | Example (Dive) |
|---|---|
| Token values (§4): colours, bands, `--f-display`, radii | Krillion navy, VT323 as the display font, all radii 0 |
| Band labels and icons | Shallows / Reef / Abyss / Trench (`TIER_UI`) |
| A **scene** (canvas or three.js) with a camera | the tall ocean depth world (`OceanStage`, `setDepth`) |
| A Mode sprite and its reactions | the anglerfish (shared with the site mascot) |
| A **sound voice** for the shared events | blips pitched by band, sonar ping |
| **Words**: the play verb, unit, section names | `BEGIN DESCENT`, metres, `THE CATCH` |
| A **score metaphor** | 10 m per point, shown as `−1,240 m` |

A theme never changes the token **names**, the motion timings, the accessibility rules or the results building blocks' structure. If a Mode needs something that isn't here, add it here first.

| Mode | `data-theme` | Accent / signal | Display font | Scene | Play verb · results | Spec | Screens |
|---|---|---|---|---|---|---|---|
| Dive | `dive` | `#ff5d8f` / `#4de3ff` | VT323 | ocean depth world, Krillion layout | `BEGIN DESCENT` · `DIVE #N COMPLETE` | `modes/dive.md` | F09 (#9) |
| Apogee | `apogee` | `#ff7a3d` / `#8fd3ff` | theme's choice | three.js rocket launch (port of `inspo/krillion-space-variant/apogee.html`) | `LAUNCH` · `MISSION REPORT` | `modes/apogee.md` (F24) | F24 (#37) |
| Leap | `leap` | `#3ddc97` / `#7ad7ff` | theme's choice | three.js voxel hopper on floating sky islands | `START CLIMB` | `modes/leap.md` (F24) | F24 (#37) |
| Pairs | `pairs` | `#ff9f43` / `#ffd84d` | theme's choice | bright pixel card table, two columns | `DEAL` | `modes/pairs.md` (F25) | F25 (#38) |
| Blitz | `blitz` | `#ff3df0` / `#3dfcff` | theme's choice | neon arcade, beat-synced pulse | `GO` | `modes/blitz.md` (F25) | F25 (#38) |
| Arena (stretch) | `arena` | `#9aa6c8` | — | three.js first-person room | `ENTER` | — | F29 (#42) |

The Apogee/Leap blocks in `globals.css` are accent placeholders; the feature that builds each Mode's screens owns its full theme. Pairs and Blitz have full themes (F25): see `modes/pairs.md` and `modes/blitz.md` § Visuals. Site-side presentation (tile name, tagline, rules one-liner, accents, verb, glyph) lives in `lib/ui/modes.ts` (`MODE_UI`), separate from `lib/modes/` (the playable list, F13/F20).

**Dive inherits the old Krillion recipes**: VT323 everywhere, the CRT overlay (`.dv-crt`), two-ring box-shadow borders with a 4 px drop (`.dv-px`, `.dv-panel`), no `border-radius` (the round sonar timer is the exception).

## 4. Tokens

Components use **only** the semantic names. In Tailwind 4 they're mapped in `@theme inline` and the per-theme values live in plain CSS blocks. The raw font tokens are `--f-*` (not `--font-*`) so `@theme inline` doesn't reference itself.

```css
:root {
  /* Surfaces */  --bg: #0a0d1c; --bg-2: #0f1326; --surface: #141a33; --surface-2: #1b2242;
                  --border: #2a3358; --border-strong: #3b4675; --ink: #05070f;
  /* Text */      --text: #eef2ff; --muted: #9aa6c8; --faint: #6b7699;
  /* Roles */     --primary: #ffd84d; --primary-text: #1a1405; --primary-drop: #b8941f;
                  --accent: #ff5d8f; --signal: #4de3ff; --reward: #ffd166; --violet: #9d7bff;
                  --success: #3ddc97; --danger: #ff5c5c; --caution: #ff9f43;
  /* Bands */     --band-1: #8fa3c4; --band-2: #4de3ff; --band-3: #9d7bff; --band-4: #ffd166; --band-miss: #3d4f6e;
  /* Heatmap */   --heat-0: #171d38; --heat-1: #12405a; --heat-2: #137a92; --heat-3: #2bbfd6; --heat-4: #7af0ff;
  /* Radius */    --r-sm: 6px; --r: 10px; --r-lg: 16px;
  /* Type */      --f-display: var(--font-pixelify), …; --f-body: var(--font-mulish), …; --f-hud: var(--font-vt323), …;
  /* Motion */    --ease-out: cubic-bezier(.22,1,.36,1); --ease-snap: cubic-bezier(.34,1.56,.64,1);
                  --ease-io: cubic-bezier(.65,0,.35,1); --ease-bounce: cubic-bezier(.2,1.5,.4,1);
                  --glow: 0 0 0 1px <signal 35%>, 0 8px 30px -8px <signal 45%>;
}
[data-theme="dive"] { /* Krillion: */ --bg: #050a14; --surface: #101d33; --surface-2: #0d1830; --border: #1b3050;
  --primary: #ff5d8f; --primary-text: #fff; --r-sm: 0; --r: 0; --r-lg: 0; --f-display: var(--font-vt323), …;
  --dive-rim: #1b3050; --dive-drop: #0b1424; … }
[data-theme="apogee"], [data-theme="leap"], [data-theme="pairs"], [data-theme="blitz"] { /* accent placeholders */ }

@theme inline {
  --font-display: var(--f-display); --font-sans: var(--f-body); --font-hud: var(--f-hud); --font-mono: var(--f-hud);
  --color-bg: var(--bg); --color-surface: var(--surface); … /* every colour token above */
  --radius-sm: var(--r-sm); --radius-md: var(--r); --radius-lg: var(--r-lg);
  --animate-rise-in, --animate-pop-in, --animate-bob, --animate-float, --animate-dot-pulse,
  --animate-gold-breathe, --animate-shake, --animate-reject
}
```

Utilities you get: `bg-bg`, `bg-surface`, `bg-surface-2`, `border-border`, `border-border-strong`, `text-text`, `text-muted`, `text-faint`, `text-primary`, `bg-primary`, `text-accent`, `text-signal`, `text-reward`, `text-violet`, `text-success`, `text-danger`, `text-caution`, `text-band-1…4`, `font-display`, `font-sans`, `font-hud`, `rounded-sm|md|lg`, `animate-rise-in|pop-in|bob|float|dot-pulse|gold-breathe|shake|reject`.

## 5. Motion, physics and sound

### 5.1 Keyframes (`app/globals.css`)

| Name | What | Typical use |
|---|---|---|
| `rise-in` | from `opacity 0, translateY(18px)`; .5s `--ease-out`, 60 ms stagger | list rows, cards (`.stagger`) |
| `pop-in` | from `opacity 0, scale(.6)`; `--ease-snap` | chips, stats, badges appearing |
| `page-in` | from `opacity 0, translateY(10px)` | `PageTransition` |
| `card-in` / `card-gone` | from `translateY(46px) scale(.92)` / to `blur(2px) translateY(-28px) scale(.9)` | Mode round cards entering/leaving |
| `score-slam` | 35%: `scale(1.4) rotate(-2deg)` + reward glow | score change |
| `crank-jolt` | `translateY(-2px)` and back, .12s | counters while counting |
| `reject-jolt` | x −8, 7, −4, 2, 0 px, .4s | wrong input |
| `shake` | ±10 px, ±.6°, decaying, .5s | timeout, one-try miss |
| `edge-throb` | opacity .15 ↔ .85, .8s infinite | hot clock edge glow |
| `line-flash` | `--line-color` glow 34 px → 16 px | Dive tier line passed |
| `title-flicker` | opacity dips 93–96%, 8s infinite | logo |
| `dot-pulse` | scale 1 ↔ 1.25 + signal glow | current progress square, live pills |
| `gold-pulse` / `gold-breathe` | reward glow 8 ↔ 26 px | top-band chip, Personal Best banner |
| `banner-in` | from `scale(.6) rotate(-3deg)`, `--ease-snap` | banners (level-up, PB) |
| `gild` | a segment flashes white, then settles | new Meter segments |
| `btn-bob` / `bob` / `float` | ±3 px / ±4 px ±2° / ±10 px | primary CTA, sprites, mascot |
| `shine-sweep` | white band crosses left → right | `.shine` |
| `flame-flicker` | scale/skew wobble | `StreakFlame` |
| `ripple-in` | from `opacity 0, scale(.2)` | heatmap cells |
| `wave` | rotate ±14° | avatar hand wave on hover |
| `badge-flip` | `rotateY` 0 → 360° | badge earned |
| `sonar-sweep` | rotate 360° | sonar timer sweep line |
| `drift` | translateX −10vw → 110vw | clouds, fish silhouettes |
| `toast-in` | from `translateY(16px) scale(.95)` | toasts |
| `float-up` | to `opacity 0, translateY(-34px)` | `+25`, `−3s` floaters |

### 5.2 Physics (`lib/motion/`, client-only, no dependencies)

```ts
spring({ from, to, stiffness = 170, damping = 18, mass = 1, velocity?, precision?, onUpdate, onRest? }): () => void
tween({ from, to, duration, ease = easeOutCubic, onUpdate, onRest? }): () => void   // counters that mustn't overshoot
burst(x, y, { count = 24, colors?, kind: "confetti" | "bubble" | "spark", spread = 380, size? })  // viewport coords, shared overlay canvas
burstFrom(element, opts)      // burst from an element's centre
confettiRain(count = 140)     // celebratory rain from the top (level-up, Topic pass)
makeParticles / stepParticles / drawParticles   // pure helpers for scene canvases (Dive bubbles)
useReducedMotion(): boolean;  prefersReducedMotion(): boolean
```

Use the spring for counters that may overshoot, landing chips, the Dive camera, tilt settle and reordered rows. Bubbles rise with buoyancy and a sine wobble; confetti bursts out, flips and falls.

### 5.3 Sound (`lib/ui/sfx.ts`, synthesized)

All sounds are **synthesized with WebAudio** (oscillators + filtered noise), no downloaded packs (decision Q25). Rules:
- Muted flag in `localStorage['sfx-muted']` (`"1"` = muted); `useSfxMuted()` keeps every toggle in sync. `SoundToggle` is the mute tile.
- Silent until the first `pointerdown` / `keydown` unlocks the AudioContext (browsers require a gesture).
- Every call is a no-op on the server, while muted, or before unlock. Hover blips are throttled to one per 60 ms.

| Call | Sound | Fired when |
|---|---|---|
| `sfx.hover()` | very quiet sine tick | hovering a button/tile |
| `sfx.click()` | short rising square blip | pressing a button |
| `sfx.toggle()` | two-note triangle | toggles, unmuting |
| `sfx.pop()` | sine pop | toasts, chips appearing |
| `sfx.whoosh()` | filtered noise | drawers, page sweeps |
| `sfx.reward()` | C-E-G-C arpeggio + shimmer | badge earned, XP gained |
| `sfx.levelUp()` | six-note fanfare + sparkle noise | level-up, Topic pass |
| `sfx.error()` | low saw drop | failed action |
| `sfx.correct(band)` | two-note blip pitched up by band 1–4; band 3+ adds a third note; band 4 a sparkle | an Answer scores |
| `sfx.wrong()` | low thud | a guess is rejected |
| `sfx.ping()` | sonar ping | each second while the clock is hot |
| `sfx.timeout()` | descending buzz | a round runs out |
| `sfx.tick()` | near-silent click | keystroke in the answer input |
| `sfx.count()` | tiny random blip | a number counting up |
| `sfx.sink()` | low whoosh + falling tone | the Dive camera descends |
| `sfx.catch(band)` | `correct(band)` + low swell | the Dive catch screen appears |

`sfx.play(event, band?)` dispatches by name.

### 5.4 Reduced motion

Under `prefers-reduced-motion: reduce`: all CSS animations and transitions collapse to ~0 ms and run once, `.shine` is hidden, springs and tweens jump to their target, particles aren't emitted, `SkyBackdrop` draws one still frame, `TiltCard` doesn't tilt, the Dive camera cuts to the new depth instead of gliding, and the mascot stops following the cursor. Colour changes, state changes and sounds stay.

## 6. Components

All client components are `"use client"`; static ones (Logo, PixelSprite, PixelIcon) work in server components. Mode-specific pieces live in `components/modes/<mode>/`.

### 6.1 Site (`components/ui/`)

| Component | File | Key props |
|---|---|---|
| `Logo` | `Logo.tsx` | `size?: sm\|md\|lg`, `href?` |
| `Button` | `Button.tsx` | `variant?: primary\|secondary\|ghost\|danger`, `size?: sm\|md\|lg`, `href?` (renders `<Link>`), `icon?`, `iconRight?`, `block?`, `sound?` (default true), plus button attributes |
| `Card`, `TiltCard` | `Card.tsx` | `Card { interactive?, as?, className }`; `TiltCard { max? = 8, glare? = true }` |
| `Panel` | `Panel.tsx` | `title?`, `action?`, `className` |
| `Chip` | `Chip.tsx` | `tone?: neutral\|accent\|signal\|reward\|violet\|success\|danger\|caution\|band-1…4\|band-miss`, `icon?` |
| `StatusPill` | `StatusPill.tsx` | `status: uploading\|parsing\|generating\|ready\|failed`, `message?` (failed shows it; no Retry, ADR-0003) |
| `Meter`, `ProgressBar`, `XpBar` | `Meter.tsx` | `Meter { value 0–100, segments? = 10, label? }` (new segments `gild`); `ProgressBar { value, max, tone?, label?, showValue?, height? }`; `XpBar { xp, levelStartXp, nextLevelXp, level }` (shine + sparks) |
| `Odometer` | `Odometer.tsx` | `value`, `format?`, `className` |
| `StreakFlame` | `StreakFlame.tsx` | `days`, `active?` (played today), `size?`, `showCount?` |
| `Badge` | `Badge.tsx` | `name`, `icon: PixelIconName`, `tone?: bronze\|silver\|gold\|gem\|accent`, `earned?`, `description?` |
| `ModeTile`, `ModeBadge`, `ModeScene` | `ModeTile.tsx` (+ `ModeTile.module.css`) | `ModeTile { mode: ModeUiId, selected?, locked?, onSelect? }` (looping mini-scene on hover); `ModeBadge { mode }`. Data: `lib/ui/modes.ts` `MODE_UI` |
| `Modal`, `Drawer` | `Modal.tsx` | `Modal { open, onClose, title?, footer? }`; `Drawer { open, onClose, side?: right\|bottom, title? }`. Escape and backdrop close; focus is trapped and restored |
| `Tooltip` | `Tooltip.tsx` | `label`, `side?: top\|bottom` |
| `Tabs` | `Tabs.tsx` | `tabs: { id, label, count? }[]`, `value`, `onChange` (sliding indicator) |
| `ToastProvider`, `useToast` | `Toast.tsx` | `useToast()({ title, body?, tone?: info\|success\|reward\|danger, icon?, ms? })`. The provider is in the root layout |
| `PixelBurst`, `celebrate()` | `Confetti.tsx` | `PixelBurst { fire: number (increment to burst), options? }` wraps an element; `celebrate()` = confetti rain + level-up chime; re-exports `burst`, `burstFrom`, `confettiRain` |
| `Mascot` | `Mascot.tsx` | `size?`, `say?`, `mood?: idle\|happy\|sad\|wow\|sleep`, `followCursor? = true`, `sleepAfterMs?`, `ref?: Ref<MascotHandle>`; `MascotHandle { react(kind: happy\|sad\|wow), say(text, ms?) }` |
| `PixelAvatar`, `AVATARS`, `AvatarPicker` | `PixelAvatar.tsx`, `avatars.ts` | `PixelAvatar { id: AvatarId, size?, bob?, imageUrl?, alt? }` (imageUrl = the Clerk photo toggle, decision Q17); `AvatarPicker { value, onChange }` over ~16 self-drawn avatars (anglerfish, axolotl, astronaut, frog, cat, robot, octopus, penguin, …) |
| `ProfileCard` | `ProfileCard.tsx` | `name`, `level`, `avatarId`, `imageUrl?`, `totalXp`, `rank`, `badges`, `streak`, `streakActive?`, `editHref?`, `onEdit?`, `profileHref` (§8) |
| `Heatmap` | `Heatmap.tsx` (+ pure `heatmap-grid.ts`) | `days: { date: 'YYYY-MM-DD', count, xp? }[]`, `weeks? = 52`, `endDate?`, `unit? = "dives"` (§8) |
| `SkyBackdrop` | `SkyBackdrop.tsx` | `variant?: auto\|day\|dusk\|night\|ocean`, `parallax? = true`, `scrollDive?` (the sea rises with page scroll, for the landing), `sea? = true`, `intensity? = 1`. Fixed at `-z-10`; the page colour lives on `<html>` so it shows through `<body>` |
| `PageTransition` | `PageTransition.tsx` | wraps page content |
| `PixelIcon`, `PixelSprite` | `PixelIcon.tsx`, `PixelSprite.tsx` | `PixelIcon { name: PixelIconName, size?, palette? }`; `PixelSprite { rows, palette, size? }` (character grid → one crispEdges SVG) |
| `SoundToggle` | `SoundToggle.tsx` | `className?` (the mute tile) |
| `SiteHeader` | `SiteHeader.tsx` | wraps the header contents in the root layout; returns null on Mode screens (`/runs/*`, `/styleguide/dive`) so they're full-bleed |

Everything above is re-exported from `components/ui/index.ts`: `import { Button, ProfileCard } from "@/components/ui"`. Avatar helpers: `AVATARS`, `DEFAULT_AVATAR`, `avatarById(id)`, `defaultAvatarFor(playerId)`.

### 6.2 Round building blocks (`components/round/`)

Shared by every typed-answer Mode (Dive, Apogee) and reusable by others.

| Component | What |
|---|---|
| `HudPlate` | A pixel plate with a micro label and a big VT323 value (`DEPTH 0m` in signal, `SCORE 0` in accent) |
| `ProgressSquares` | The row of squares + `PROMPT n OF 7`: done (reward), miss (`--band-miss`), current (accent, `dot-pulse`), upcoming |
| `RoundCard` | The prompt card: accent tracking label, big prompt text, a micro rules line, hint slot, `stamp` (e.g. `TIME!`); `card-in` / `card-gone` |
| `SonarTimer` | Round clock: digits in the middle, conic drain, sweep line; hot (accent, faster sweep) at ≤ 5 s; `aria-live` at 10 s and 5 s. Rendered from the server's `deadlineAt` |
| `Fuse` | Thin bar under the input that drains with time; `cut(seconds)` flashes the lost piece after a penalty |
| `TypedInput` | Open, cloze and definition Prompts: large input, Enter submits, keeps focus, correction line below, `reject-jolt` on a wrong guess |
| `OptionGrid` | Odd-one-out: 2×2 option buttons, marks right/wrong, locks after one try |
| `OrderList` | Put-in-order: drag (and keyboard move) with springs, position numbers, `LOCK IN ▼` |
| `HintButton` | Ghost button showing the cost (`ABYSS → REEF`), usable once |
| `ResultChip` | The matched Answer in a chip ringed and glowing in its band colour with `+points`; the Mode decides how it moves |

### 6.3 Results building blocks (`components/results/`)

| Component | What |
|---|---|
| `ResultHeader` | Big counting score, the Mode's secondary metric (Dive: depth), optional `★ NEW PERSONAL BEST` banner (`banner-in` + `gold-breathe`) |
| `DistributionChart` | A smooth curve of scores with a `YOU` marker and caption: for private Games, your own past Run scores (+ Personal Best); for public Games (Daily, Course), today's players ("better than X% of today's players") |
| `BandTable` | Score ranges with icon and one-line verdict; the Player's row is lit |
| `ResultList` | One row per round (band icon, prompt, your answer, tags, points), expandable: Open Prompts get tier filter chips with counts, search and every Answer with Evidence; single-answer Prompts get the Answer, explanation and Evidence |
| `EvidenceLine` | Mulish text, pixel doc icon, `Week 9 slides · p.41 — "…"`; links into the file viewer (`?doc=&page=`) |

### 6.4 Dive (`components/modes/dive/`)

`tiers.ts` (`TIER_UI`), `depth.ts` (`DiveCamera`, metres ↔ screen mapping), `OceanStage` (canvas depth world with a camera; `setDepth(metres)`), `DepthRuler` (+ `YOU ◀` marker), `DiveHud` (three-plate HUD row), `TierLines` (its `sink` prop drops the sinking chip), `CatchScreen`, `DiveLogChart`, `DiveReveal`, `DivePlayground` (the fake 7-Prompt Dive on `/styleguide/dive`). Spec: `modes/dive.md`.

## 7. Screens per world

| Route | World | Built from | Feature |
|---|---|---|---|
| `/` (signed out) | site | `SkyBackdrop` (sky → ocean on scroll), `Logo lg`, `Mascot`, primary + secondary `Button`, how-it-works cards, `ModeTile` marquee, Explore teaser, Daily teaser | F19 (#32) |
| `/home` | site | greeting + `Mascot` speech bubble, "Jump back in" `TiltCard`, Daily card, `ProfileCard` sidebar, friends' activity, leaderboard snippet | F19 (#32) |
| `/explore`, `/explore/[course]`, `/explore/[course]/[topic]` | site | course `TiltCard`s, banner hero, numbered Topic timeline, reading, `ModeTile` practice panel, `confettiRain` on pass | F27 (#40) |
| `/daily` | site | today's card, flip-clock countdown, `StreakFlame`, leaderboard with FLIP rows, archive | F28 (#41) |
| `/leaderboard`, `/friends`, `/u/[username]`, `/profile` | site | `Tabs`, rows, `ProfileCard`, `Heatmap`, `Badge` grid, `AvatarPicker` (Edit) | F26 (#39) |
| `/modules`, `/modules/[id]` | site | `Card`s, `StatusPill`, file viewer `Drawer`, New Game `Modal` with `ModeTile`s | F08 |
| `/games/[id]` | site frame + the Mode's stats block (in its theme) | header, `ModeBadge`, file chips, the Mode's stats, recent Runs, the Mode's Play `Button` | F11 (#11) |
| `/runs/[id]`, `/runs/[id]/reveal` | Mode | the Mode's theme, round and results blocks | F09 (#9) Dive; F24/F25 others |
| `/styleguide` | dev only | everything, plus the Dive playground | F10 |

## 8. Profile card and heatmap

**ProfileCard** (decision Q12, the Codedex-style card Anton asked for, data via props):

```
┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐   dark --surface card, stepped 2px --border-strong frame (.px-frame)
┊        [pixel avatar]       ┊   PixelAvatar (bobs; waves on hover), ~72 px
┊            Edit             ┊   small link under it → AvatarPicker (or editHref)
┊        Anton Florendo       ┊   name in Pixelify Sans
┊           Level 4           ┊   muted
┊  ★ 630        ◈ Shrimp     ┊   2×2 grid: gold 4-point star + "Total XP"; bronze rank emblem + rank name
┊   Total XP     Rank         ┊   (ocean ranks: Plankton → Leviathan)
┊  ◆ 7          🔥 2         ┊   blue gem + "Badges"; orange flame (StreakFlame) + "Day streak"
┊   Badges       Day streak   ┊   numbers roll (Odometer)
┊ [      View profile       ] ┊   full-width pixel-bordered Button → profileHref
└┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
```

**Heatmap** (F21 data from the `player_activity_daily` continuous aggregate):
- GitHub-style grid: 52 weeks × 7 days, columns are weeks (Sunday at the top), month labels above, Mon/Wed/Fri labels at the left.
- 5 levels `--heat-0…4` from the day's activity (Runs finished + XP), with a "Less ▢▢▢▢▢ More" legend.
- Cells `ripple-in` on load, staggered by distance from today. Hover/focus shows a tooltip: `3 runs · 120 XP · Oct 2, 2026`.
- Each cell is focusable with an `aria-label`; the grid scrolls horizontally inside its card on narrow screens (never the page).

## 9. Accessibility

- Contrast: body text ≥ 4.5:1 (text on surface ~14:1; muted on surface ~6:1); `--faint` only for captions ≥ 13 px.
- Focus: `outline: 2px solid var(--signal); outline-offset: 3px` on everything interactive (global `:focus-visible`).
- Body text ≥ 15 px.
- Bands, tiers and statuses are never colour alone: always icon + name, or icon + points.
- Everything is keyboard reachable: tiles and cards are buttons or links; `OrderList` supports keyboard moves; `Modal`/`Drawer` trap focus and close on Escape.
- Game timers announce via `aria-live="polite"` at 10 s and 5 s only. The answer input keeps focus between guesses. Toasts live in a polite region.
- Decorative canvases and sprites are `aria-hidden`; meaningful sprites (avatars, badges) get a label.
- Reduced motion: §5.4. Sound is optional and always mutable.

## 10. Mobile (375 px)

- Every site page works at 375 px: 16 px gutters, no horizontal page scroll (wide content such as the heatmap scrolls inside its own card).
- Sidebars stack under the main content; 2-column grids become 1 column below `sm` (640 px); the ProfileCard keeps its 2×2 stats.
- The nav collapses to a menu sheet (`Drawer side="bottom"`).
- Touch targets ≥ 40 px. Hover-only effects (tilt, mini-scenes, cursor-following eyes) have a tap/focus equivalent or are simply skipped on touch.
- Mode screens are playable on mobile: the input dock sits at the bottom above the keyboard, the HUD plates shrink, the Dive depth ruler narrows to ticks only.

## 11. Build order

**F10 (this feature) ships:**
1. Fonts (`next/font/google`: Pixelify Sans, Mulish, VT323) and §4 tokens in `app/globals.css`, with the recipes and §5.1 keyframes.
2. `lib/motion/` and `lib/ui/sfx.ts`; `lib/ui/modes.ts`.
3. The site components (§6.1).
4. The round, results and Dive building blocks (§6.2–6.4), including the Dive playground.
5. `/styleguide` (dev only), the dev auth bypass (`DEV_PLAYER_ID`, `NODE_ENV=development` only), and a minimal restyled header.

**Built on top:** F19 (#32) site shell, full nav, landing and `/home` · F09 (#9) Dive Run and Reveal on the real engine · F11 (#11) Game page · F08 Modules pages + file viewer · F24 (#37) Apogee and Leap · F25 (#38) Pairs and Blitz · F26 (#39) profile, friends, leaderboards · F27 (#40) Explore, Course, Topic · F28 (#41) Daily hub.

Port from the mock; don't import it.

## 12. Open

- **Name** stays SYLLABYSS (decision Q3), though it reads ocean-only now that there are space/sky Modes. Changing it touches `<Logo>` and the metadata title. **CHECK.**
- **Light mode** deferred; tokens are ready for a `[data-color-scheme="light"]` block. **CHECK.**
- **Rank names** (Plankton 1–2, Shrimp 3–4, Reef Fish 5–7, Dolphin 8–11, Orca 12–16, Leviathan 17+) come from decision Q11; the emblem colours per rank are a design guess. **CHECK.**
