# #10 F10 Visual design system (site + Mode themes)

Status: done
Branch: feat/10-design-system (base `chore/overnight-plan`, PR stacked on #43)
Updated: 2026-10-04 05:30

## Goal
The foundation every UI feature builds on, in the new direction (overnight-decisions §1–3, §12–14):
a Codedex-inspired but much more alive **site** look, plus **Mode themes** via `data-theme`, with Dive
keeping the Krillion recipes and getting real descent. Spec: `docs/design/design-system.md`,
`docs/design/modes/dive.md`, `docs/architecture/ui-map.md`.

## Component contract (planned; names + key props)
`components/ui/` (site, theme-neutral):
- `Logo { size?: sm|md|lg; href? }`
- `Button { variant?: primary|secondary|ghost|danger; size?: sm|md|lg; href?; icon?; iconRight?; block?; sound? } & button attrs` (`.px-btn`)
- `Card { interactive?; as?; className }`, `TiltCard { max?=8; glare?=true }`
- `Panel { title?; action?; className }`
- `Chip { tone?: neutral|accent|signal|reward|violet|success|danger|caution|band-1..4|band-miss; icon? }`
- `StatusPill { status: uploading|parsing|generating|ready|failed; message? }`
- `Meter { value 0–100; segments?=10; label? }`, `ProgressBar { value; max; tone?; label? }`, `XpBar { xp; levelStartXp; nextLevelXp; level }`
- `Odometer { value; format?; className }`
- `StreakFlame { days; active?; size? }`
- `Badge { name; icon: PixelIconName; tone?: bronze|silver|gold|gem|accent; earned?; description? }`
- `ModeTile { mode: ModeUiId; selected?; locked?; onSelect? }`, `ModeBadge { mode }` (data in `lib/ui/modes.ts` `MODE_UI`)
- `Modal { open; onClose; title?; footer? }`, `Drawer { open; onClose; side?: right|bottom; title? }`
- `Tooltip { label; side?: top|bottom }`, `Tabs { tabs: {id,label,count?}[]; value; onChange }`
- `ToastProvider` + `useToast()(input: { title; body?; tone?: info|success|reward|danger })`
- `PixelBurst` / `confetti()` (wrappers over `lib/motion/particles` `burst`, `burstFrom`, `confettiRain`)
- `Mascot { size?; say?; mood?: idle|happy|sad|wow|sleep; followCursor?=true; sleepAfterMs?; ref?: Ref<MascotHandle> }`, `MascotHandle { react(kind: happy|sad|wow); say(text, ms?) }`
- `PixelAvatar { id: AvatarId; size?; bob?; imageUrl?; alt? }`, `AVATARS`, `AvatarPicker { value; onChange }`
- `ProfileCard { name; level; avatarId; imageUrl?; totalXp; rank; badges; streak; editHref?; onEdit?; profileHref }`
- `Heatmap { days: {date: 'YYYY-MM-DD'; count; xp?}[]; weeks?=52; endDate? }`
- `SkyBackdrop { variant?: auto|day|dusk|night|ocean; parallax?=true; className }`
- `PageTransition`, `PixelIcon { name; size? }`, `PixelSprite { rows; palette; size? }`, `SoundToggle`

`lib/motion/`: `spring`, `tween`, `burst`, `burstFrom`, `confettiRain`, `useReducedMotion`, `prefersReducedMotion`.
`lib/ui/sfx.ts`: `sfx.hover|click|toggle|pop|whoosh|reward|levelUp|error|correct(band)|wrong|ping|timeout|tick|count|sink|catch(band)`, `useSfxMuted()`.

Dive / round / results (built by a parallel sub-task):
- `components/round/`: `HudPlate`, `ProgressSquares`, `RoundCard`, `SonarTimer`, `Fuse`, `TypedInput`, `OptionGrid`, `OrderList`, `HintButton`, `ResultChip`
- `components/results/`: `ResultHeader`, `DistributionChart`, `BandTable`, `ResultList`, `EvidenceLine`
- `components/modes/dive/`: `tiers.ts` (`TIER_UI`), `OceanStage` (`setDepth`), `DepthRuler`, `DiveHud`, `TierLines`, `CatchScreen`, `DiveLogChart`, `DivePlayground`

## Done so far
- Docs: `design-system.md` rewritten (two worlds), `modes/dive.md` (Krillion layout, real descent, catch screen, Reveal column), `ui-map.md` (new routes, file viewer, dev bypass).
- Mock: Dive with real descent (depth zones, ruler + YOU, sinking chip → catch screen → next prompt, Reveal over the sea; `?autoplay#run`), site shell refresh (`#landing`, `#home`, sky backdrop, mascot, profile card, heatmap, Mode tiles).
- App: tokens/fonts/keyframes, `lib/motion`, `lib/ui/sfx.ts` (synthesized), `lib/ui/modes.ts`, full `components/ui/` kit (barrel `components/ui/index.ts`), `components/round/`, `components/results/`, `components/modes/dive/`, `/styleguide` + `/styleguide/dive`, `SiteHeader` (hidden on Mode screens), dev auth bypass (`DEV_PLAYER_ID`, dev only; announced on #10).
- Checks: tsc, lint, 114 unit tests, `next build` all pass. Dev server on 3100: `/`, `/modules`, `/styleguide`, `/styleguide/dive` load with no console errors; Dive flow verified (catch screen, descent).

## Next steps
- None for F10. Follow-ups for others are in FEATURES.md F10 "Known gaps".

## Decisions & gotchas
- Made without Anton: Mode presentation data in `lib/ui/modes.ts` (accent colours, taglines, verbs incl. Leap "START CLIMB", Pairs "DEAL", Blitz "GO"); mascot named "Lumen"; depth zones compressed to a 0–7,000 m game (sunlit <200, twilight <1,000, midnight <3,000, abyss <5,500, trench); `pxPerMetre = H/300`; SkyBackdrop picks day/dusk/night from the local clock (all dark-tinted, light mode deferred); the mock and `inspo/` are ignored by eslint (reference JS, never imported).
- The site header hides itself on `/runs/*` so Mode screens are full-bleed.
- Raw font tokens are `--f-display/--f-body/--f-hud` (not `--font-*`) so Tailwind's `@theme inline` doesn't self-reference.
- `[data-theme="dive"]` swaps `--f-display` to VT323 and zeroes the radii, so site components inside Dive pick up the Krillion look.
- Mode presentation lives in `lib/ui/modes.ts` (`MODE_UI`), separate from `lib/modes/` (F20 owns the playable list).

## Files touched
- app/globals.css, app/layout.tsx, lib/motion/*, lib/ui/*, components/ui/*
