"use client";
import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  AvatarPicker,
  AVATARS,
  Badge,
  Button,
  Card,
  celebrate,
  Chip,
  Drawer,
  Heatmap,
  Logo,
  Mascot,
  Meter,
  Modal,
  ModeBadge,
  ModeTile,
  Odometer,
  Panel,
  PixelAvatar,
  PixelBurst,
  PixelIcon,
  PIXEL_ICON_NAMES,
  ProfileCard,
  ProgressBar,
  SkyBackdrop,
  StatusPill,
  StreakFlame,
  Tabs,
  TiltCard,
  Tooltip,
  useToast,
  XpBar,
  type AvatarId,
  type HeatDay,
  type MascotHandle,
  type SkyVariant,
} from "@/components/ui";
import { MODE_UI_LIST, type ModeUiId } from "@/lib/ui/modes";
import { sfx, type SfxEvent } from "@/lib/ui/sfx";
import { DiveComponents } from "./DiveComponents";

const SECTIONS = [
  ["tokens", "Tokens"],
  ["type", "Type"],
  ["buttons", "Buttons"],
  ["cards", "Cards"],
  ["tags", "Chips & pills"],
  ["progress", "Progress"],
  ["numbers", "Numbers & streaks"],
  ["badges", "Badges"],
  ["modes", "Mode tiles"],
  ["overlays", "Overlays"],
  ["mascot", "Mascot"],
  ["avatars", "Avatars"],
  ["profile", "Profile card"],
  ["heatmap", "Heatmap"],
  ["sky", "Backdrop"],
  ["sound", "Sound"],
  ["dive", "Dive theme"],
] as const;

const COLORS = [
  "bg", "bg-2", "surface", "surface-2", "border", "border-strong", "text", "muted", "faint",
  "primary", "accent", "signal", "reward", "violet", "success", "danger", "caution",
  "band-1", "band-2", "band-3", "band-4", "band-miss", "heat-0", "heat-1", "heat-2", "heat-3", "heat-4",
];

function Section({ id, title, children, note }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="label-line mb-1 !text-[13px]">{title}</h2>
      {note && <p className="mb-4 text-sm text-muted">{note}</p>}
      <div className={note ? "" : "mt-4"}>{children}</div>
    </section>
  );
}

// Deterministic fake activity so server and client render the same grid.
function fakeDays(): HeatDay[] {
  const out: HeatDay[] = [];
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const end = Date.UTC(2026, 9, 4);
  for (let i = 0; i < 364; i++) {
    const r = rnd();
    const streaky = i < 30 ? 0.75 : 0.4;
    if (r < streaky) {
      const count = 1 + Math.floor(rnd() * (i < 60 ? 6 : 3));
      out.push({ date: new Date(end - i * 86400000).toISOString().slice(0, 10), count, xp: count * 35 });
    }
  }
  return out;
}

const SFX: SfxEvent[] = ["hover", "click", "toggle", "pop", "whoosh", "reward", "levelUp", "error", "wrong", "ping", "timeout", "tick", "count", "sink"];

export function StyleguideClient() {
  const toast = useToast();
  const mascot = useRef<MascotHandle>(null);
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [editAvatar, setEditAvatar] = useState(false);
  const [avatar, setAvatar] = useState<AvatarId>("anglerfish");
  const [tab, setTab] = useState("global");
  const [mode, setMode] = useState<ModeUiId>("dive");
  const [xp, setXp] = useState(630);
  const [num, setNum] = useState(12840);
  const [fire, setFire] = useState(0);
  const [mastery, setMastery] = useState(31);
  const [sky, setSky] = useState<SkyVariant>("auto");
  const days = useMemo(fakeDays, []);

  return (
    <div className="relative min-h-screen">
      <SkyBackdrop variant={sky} intensity={0.55} />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[180px_1fr]">
        <nav aria-label="Styleguide sections" className="lg:sticky lg:top-20 lg:self-start">
          <Logo size="sm" />
          <p className="mt-1 mb-4 text-xs text-faint">F10 styleguide · dev only</p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm lg:flex-col">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="text-muted hover:text-signal">
                  {label}
                </a>
              </li>
            ))}
            <li className="mt-2">
              <a href="/styleguide/dive" className="font-display text-primary hover:underline">
                ▼ Dive playground
              </a>
            </li>
          </ul>
        </nav>

        <main className="flex min-w-0 flex-col gap-14">
          <header className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <Logo size="lg" />
              <p className="mt-2 max-w-xl text-muted">
                Every F10 building block, live. Site look: Pixelify Sans + Mulish on night navy. Mode screens switch looks with{" "}
                <code className="text-signal">data-theme</code>.
              </p>
            </div>
            <Mascot ref={mascot} size={110} say="Hi! I'm Lumen. Poke me." bubbleSide="left" />
          </header>

          <Section id="tokens" title="Colour tokens" note="Semantic names only; Mode themes override them under [data-theme].">
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-9">
              {COLORS.map((c) => (
                <div key={c} className="text-center">
                  <div className="h-12 rounded-md ring-1 ring-border" style={{ background: `var(--${c})` }} />
                  <code className="mt-1 block text-[11px] text-muted">--{c}</code>
                </div>
              ))}
            </div>
          </Section>

          <Section id="type" title="Type">
            <div className="space-y-3">
              <h1 className="text-5xl">Pixelify display 48</h1>
              <h2 className="text-3xl">Section heading 30</h2>
              <h3 className="text-xl">Card title 20</h3>
              <p className="max-w-2xl">
                Mulish body 15/1.55. Turn your notes into games: every Answer is backed by a page in your own slides, so the
                Reveal can show you exactly where it came from.
              </p>
              <p className="text-sm text-muted">Muted 14 for secondary text.</p>
              <p className="font-hud text-5xl text-signal">VT323 HUD −1,240 m</p>
            </div>
          </Section>

          <Section id="buttons" title="Buttons" note="Stepped pixel corners, hard drop, squash on press and spring back. Hover/click blips.">
            <div className="flex flex-wrap items-center gap-5">
              <Button variant="primary" size="lg" iconRight="▶">
                Start playing
              </Button>
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Delete</Button>
              <Button variant="primary" size="sm">
                Small
              </Button>
              <Button disabled>Disabled</Button>
              <Button variant="secondary" icon={<PixelIcon name="flame" size={16} />}>
                With icon
              </Button>
            </div>
          </Section>

          <Section id="cards" title="Cards">
            <div className="grid gap-5 sm:grid-cols-3">
              <Card className="p-5">
                <h3 className="text-lg">Card</h3>
                <p className="text-sm text-muted">Static surface.</p>
              </Card>
              <Card interactive className="p-5">
                <h3 className="text-lg">Interactive card</h3>
                <p className="text-sm text-muted">Lifts and glows on hover.</p>
              </Card>
              <TiltCard>
                <div className="p-5">
                  <h3 className="text-lg">TiltCard</h3>
                  <p className="text-sm text-muted">Tilts toward the cursor with a glare.</p>
                </div>
              </TiltCard>
            </div>
            <Panel title="Panel title" action={<Button size="sm">Action</Button>} className="mt-5">
              <p className="text-sm text-muted">A titled section with a dashed hairline label.</p>
            </Panel>
          </Section>

          <Section id="tags" title="Chips & status pills">
            <div className="flex flex-wrap gap-2">
              {(["neutral", "accent", "signal", "reward", "violet", "success", "danger", "caution"] as const).map((t) => (
                <Chip key={t} tone={t}>
                  {t}
                </Chip>
              ))}
              <Chip tone="band-4" icon={<PixelIcon name="lantern" size={12} />}>
                TRENCH +100
              </Chip>
              <Chip tone="band-3" icon={<PixelIcon name="jelly" size={12} />}>
                ABYSS +60
              </Chip>
              <Chip tone="neutral" icon={<PixelIcon name="doc" size={12} />}>
                Week 9 slides
              </Chip>
            </div>
            <div className="mt-4 flex flex-wrap gap-4">
              <StatusPill status="uploading" />
              <StatusPill status="parsing" />
              <StatusPill status="generating" />
              <StatusPill status="ready" />
              <StatusPill status="failed" message="This PDF has no text layer (scanned?)" />
            </div>
          </Section>

          <Section id="progress" title="Progress">
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-4">
                <XpBar xp={xp} levelStartXp={600} nextLevelXp={1000} level={4} />
                <Button size="sm" variant="primary" onClick={() => setXp((x) => Math.min(999, x + 75))}>
                  +75 XP (sparks)
                </Button>
              </div>
              <div className="space-y-4">
                <ProgressBar label="Python Basics" value={3} max={6} showValue tone="var(--signal)" />
                <div>
                  <p className="mb-1.5 text-xs text-muted">Mastery {mastery}%</p>
                  <Meter value={mastery} label="Mastery" />
                </div>
                <Button size="sm" onClick={() => setMastery((m) => Math.min(100, m + 17))}>
                  Gild +17%
                </Button>
              </div>
            </div>
          </Section>

          <Section id="numbers" title="Numbers & streaks">
            <div className="flex flex-wrap items-center gap-10">
              <div>
                <Odometer value={num} className="font-display text-5xl text-reward" />
                <div className="mt-2">
                  <Button size="sm" onClick={() => setNum(Math.floor(Math.random() * 99999))}>
                    Roll
                  </Button>
                </div>
              </div>
              <StreakFlame days={12} size={48} />
              <StreakFlame days={3} active={false} size={48} />
            </div>
          </Section>

          <Section id="badges" title="Badges" note="Hover to flip; earned ones gleam. Click the trophy for a pixel burst.">
            <div className="flex flex-wrap gap-4">
              <PixelBurst fire={fire}>
                <span onClick={() => setFire((f) => f + 1)}>
                  <Badge name="First Dive" icon="trophy" tone="gold" />
                </span>
              </PixelBurst>
              <Badge name="7-day streak" icon="flame" tone="bronze" />
              <Badge name="Trench Diver" icon="lantern" tone="gem" />
              <Badge name="Perfect Leap" icon="sprout" tone="silver" />
              <Badge name="Daily Top 10" icon="crown" tone="accent" />
              <Badge name="30-day streak" icon="flame" earned={false} description="Play 30 days in a row" />
            </div>
          </Section>

          <Section id="modes" title="Mode tiles" note="Each tile plays its mini-scene on hover or when selected.">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {MODE_UI_LIST.map((m) => (
                <ModeTile key={m.id} mode={m.id} selected={mode === m.id} locked={m.id === "arena"} onSelect={setMode} />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {MODE_UI_LIST.map((m) => (
                <ModeBadge key={m.id} mode={m.id} />
              ))}
            </div>
          </Section>

          <Section id="overlays" title="Overlays, tabs, toasts">
            <div className="flex flex-wrap items-center gap-4">
              <Button onClick={() => setModal(true)}>Open modal</Button>
              <Button onClick={() => setDrawer(true)}>Open drawer</Button>
              <Tooltip label="Used by Graphs Midterm. Delete that Game first.">
                <Button variant="ghost">Hover for tooltip</Button>
              </Tooltip>
              <Button onClick={() => toast({ title: "Saved", body: "Your avatar is updated.", tone: "success" })}>Toast</Button>
              <Button
                variant="primary"
                onClick={() => {
                  celebrate();
                  toast({ title: "Level 5!", body: "You're a Reef Fish now.", tone: "reward" });
                }}
              >
                Level up!
              </Button>
            </div>
            <Tabs
              className="mt-6"
              label="Leaderboard scope"
              value={tab}
              onChange={setTab}
              tabs={[
                { id: "global", label: "Global" },
                { id: "friends", label: "Friends", count: 4 },
                { id: "weekly", label: "Weekly XP" },
              ]}
            />
            <p className="mt-3 text-sm text-muted">Selected tab: {tab}</p>
            <Modal
              open={modal}
              onClose={() => setModal(false)}
              title="New Game"
              footer={
                <>
                  <Button variant="ghost" onClick={() => setModal(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={() => setModal(false)}>
                    Create Game
                  </Button>
                </>
              }
            >
              <p className="text-sm text-muted">Pick a Mode, a title and the files to build it from.</p>
            </Modal>
            <Drawer open={drawer} onClose={() => setDrawer(false)} title="Week 9 slides · Parsed text of your file">
              <p className="text-sm text-muted">The file viewer (F08/F19) uses this drawer: page list on the left, markdown on the right.</p>
            </Drawer>
          </Section>

          <Section id="mascot" title="Mascot" note="Eyes follow the cursor, blinks, dozes after 25 s idle, click 5× for a secret.">
            <div className="flex flex-wrap items-end gap-8">
              <Mascot size={140} />
              <Mascot size={80} mood="sleep" />
              <Mascot size={80} mood="sad" />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => mascot.current?.react("happy")}>
                  react(happy)
                </Button>
                <Button size="sm" onClick={() => mascot.current?.react("sad")}>
                  react(sad)
                </Button>
                <Button size="sm" onClick={() => mascot.current?.react("wow")}>
                  react(wow)
                </Button>
                <Button size="sm" onClick={() => mascot.current?.say("Your streak is on fire!")}>
                  say()
                </Button>
              </div>
            </div>
          </Section>

          <Section id="avatars" title="Pixel avatars" note="16 self-drawn characters. Hover one to wave.">
            <div className="flex flex-wrap gap-3">
              {AVATARS.map((a) => (
                <PixelAvatar key={a.id} id={a.id} size={64} />
              ))}
            </div>
          </Section>

          <Section id="profile" title="Profile card">
            <div className="grid gap-6 sm:grid-cols-[320px_1fr]">
              <ProfileCard
                name="Anton"
                level={4}
                avatarId={avatar}
                totalXp={630}
                rank="Shrimp"
                badges={7}
                streak={2}
                onEdit={() => setEditAvatar(true)}
                profileHref="/styleguide#profile"
              />
              <p className="text-sm text-muted">
                Props: name, level, avatarId, imageUrl?, totalXp, rank, badges, streak, streakActive?, editHref? | onEdit?,
                profileHref. Edit opens the AvatarPicker.
              </p>
            </div>
            <Modal open={editAvatar} onClose={() => setEditAvatar(false)} title="Choose your avatar" className="max-w-2xl">
              <AvatarPicker value={avatar} onChange={setAvatar} />
            </Modal>
          </Section>

          <Section id="heatmap" title="Activity heatmap" note="52 weeks, 5 levels, ripples in from today; hover or tab through for tooltips.">
            <Card className="p-4">
              <Heatmap days={days} endDate="2026-10-04" />
            </Card>
          </Section>

          <Section id="sky" title="Living backdrop" note="Fixed behind the page. Auto picks day/dusk/night from your clock.">
            <div className="flex flex-wrap gap-2">
              {(["auto", "day", "dusk", "night", "ocean"] as const).map((v) => (
                <Button key={v} size="sm" variant={sky === v ? "primary" : "secondary"} onClick={() => setSky(v)}>
                  {v}
                </Button>
              ))}
            </div>
          </Section>

          <Section id="sound" title="Synthesized sound" note="WebAudio, no files. Mute with the speaker tile (stored in localStorage).">
            <div className="flex flex-wrap gap-2">
              {SFX.map((e) => (
                <Button key={e} size="sm" variant="ghost" sound={false} onClick={() => sfx.play(e)}>
                  {e}
                </Button>
              ))}
              {([1, 2, 3, 4] as const).map((b) => (
                <Button key={b} size="sm" variant="ghost" sound={false} onClick={() => sfx.correct(b)}>
                  correct({b})
                </Button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-6 gap-3 sm:grid-cols-10">
              {PIXEL_ICON_NAMES.map((n) => (
                <Tooltip key={n} label={n}>
                  <span className="grid h-10 w-10 place-items-center rounded-sm bg-surface ring-1 ring-border" tabIndex={0}>
                    <PixelIcon name={n} size={24} />
                  </span>
                </Tooltip>
              ))}
            </div>
          </Section>

          <Section id="dive" title="Dive theme (Mode screens)" note='The same tokens inside data-theme="dive": VT323, no radius, Krillion palette.'>
            <DiveComponents />
          </Section>
        </main>
      </div>
    </div>
  );
}
