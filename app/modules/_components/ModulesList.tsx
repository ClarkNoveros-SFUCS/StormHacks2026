"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { TiltCard } from "@/components/ui/Card";
import { ModeBadge } from "@/components/ui/ModeTile";
import { Mascot, type MascotHandle } from "@/components/ui/Mascot";
import { Odometer } from "@/components/ui/Odometer";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { useToast } from "@/components/ui/Toast";
import { burstFrom } from "@/lib/motion/particles";
import { MODE_UI } from "@/lib/ui/modes";
import { sfx } from "@/lib/ui/sfx";
import { createModule } from "../actions";
import { bestInWords } from "../_lib/mode-words";
import type { ModuleCardData } from "../_lib/types";
import { ModuleBanner } from "./ModuleBanner";
import s from "./modules.module.css";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function relative(iso: string | null) {
  if (!iso) return null;
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ModulesList({ modules }: { modules: ModuleCardData[] }) {
  const files = modules.reduce((n, m) => n + m.fileCount, 0);
  const games = modules.reduce((n, m) => n + m.gameCount, 0);
  const mascot = useRef<MascotHandle>(null);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <p className="label-line max-w-xs">Your library</p>
          <h1 className="text-[32px] leading-tight text-text sm:text-[40px]">My Modules</h1>
          <p className="max-w-xl text-muted">
            One Module per subject. Drop your slides and notes in, then turn them into games.
          </p>
        </div>
        {modules.length > 0 && (
          <dl className="flex gap-3">
            {[
              { label: "Modules", value: modules.length, color: "var(--signal)" },
              { label: "Files", value: files, color: "var(--violet)" },
              { label: "Games", value: games, color: "var(--reward)" },
            ].map((st) => (
              <div key={st.label} className="card flex min-w-[84px] flex-col items-center px-3 py-2">
                <dd className="font-hud text-4xl leading-none" style={{ color: st.color }}>
                  <Odometer value={st.value} />
                </dd>
                <dt className="mt-1 font-display text-[11px] tracking-[.2em] text-muted uppercase">{st.label}</dt>
              </div>
            ))}
          </dl>
        )}
      </header>

      {modules.length === 0 ? (
        <EmptyState mascot={mascot} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <li className={s.cardEnter} style={{ "--i": 0 } as React.CSSProperties}>
            <NewModuleCard />
          </li>
          {modules.map((m, i) => (
            <li key={m.id} className={s.cardEnter} style={{ "--i": i + 1 } as React.CSSProperties}>
              <ModuleCard m={m} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ModuleCard({ m }: { m: ModuleCardData }) {
  const best = m.best ? bestInWords(m.best.mode, m.best.score) : null;
  const played = relative(m.lastPlayed);
  return (
    <TiltCard className="h-full">
      <Link
        href={`/modules/${m.id}`}
        onMouseEnter={() => sfx.hover()}
        onClick={() => sfx.click()}
        className="group flex h-full flex-col focus-visible:outline-offset-[-2px]"
      >
        <div className="relative h-24 overflow-hidden border-b border-border">
          <ModuleBanner id={m.id} fileCount={m.fileCount} modes={m.modes} />
          <span className="absolute top-2 right-2 rounded-sm bg-bg/70 px-2 py-0.5 font-display text-[11px] tracking-widest text-muted uppercase backdrop-blur-sm">
            {played ? `Played ${played}` : "Not played yet"}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          <h2 className="text-lg leading-snug text-text transition group-hover:text-primary">{m.name}</h2>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <PixelIcon name="doc" size={14} />
              {plural(m.fileCount, "file")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <PixelIcon name="cards" size={14} />
              {plural(m.gameCount, "game")}
            </span>
          </p>
          {m.modes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {m.modes.map((mode) => (
                <ModeBadge key={mode} mode={mode} />
              ))}
            </div>
          )}
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-dashed border-border pt-3">
            {best && m.best ? (
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="font-display text-[11px] tracking-widest text-faint uppercase">Best</span>
                <span className="font-hud text-2xl leading-none text-reward" title={m.best.title}>
                  <span aria-hidden="true" style={{ color: MODE_UI[m.best.mode].accent }}>
                    {MODE_UI[m.best.mode].icon}{" "}
                  </span>
                  {best.value}
                </span>
              </span>
            ) : (
              <span className="text-sm text-faint">{m.gameCount ? "No finished runs yet" : "No games yet"}</span>
            )}
            <span aria-hidden="true" className="font-display text-primary transition group-hover:translate-x-1">
              Open →
            </span>
          </div>
        </div>
      </Link>
    </TiltCard>
  );
}

/** The "+ New Module" card: click to unfold a name field, Enter to create and open it. */
function NewModuleCard({ big = false }: { big?: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Give your Module a name");
      sfx.error();
      return;
    }
    setError(null);
    start(async () => {
      const res = await createModule(name);
      if ("error" in res) {
        setError(res.error);
        sfx.error();
        return;
      }
      burstFrom(formRef.current, { count: 36 });
      sfx.reward();
      toast({ title: `${name.trim()} created`, body: "Now drop your notes in.", tone: "success", icon: "sparkle" });
      router.push(`/modules/${res.id}`);
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onMouseEnter={() => sfx.hover()}
        onClick={() => {
          sfx.click();
          setOpen(true);
        }}
        className={`${s.newCard} card flex h-full w-full flex-col items-center justify-center gap-3 border-dashed p-6 text-center ${
          big ? "min-h-[180px]" : "min-h-[230px]"
        }`}
      >
        <span className={`${s.plus} grid h-14 w-14 place-items-center rounded-md bg-primary font-display text-3xl text-primary-text shadow-[0_4px_0_var(--primary-drop)]`}>
          +
        </span>
        <span className="font-display text-lg text-text">New Module</span>
        <span className="text-sm text-muted">A course, a class, a subject</span>
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      className={`${s.formIn} card flex h-full flex-col justify-center gap-3 border-primary p-5 ${big ? "min-h-[180px]" : "min-h-[230px]"} ${
        pending ? s.creating : ""
      }`}
    >
      <label htmlFor="new-module-name" className="font-display text-sm tracking-widest text-primary uppercase">
        Name your Module
      </label>
      <input
        id="new-module-name"
        autoFocus
        value={name}
        maxLength={80}
        disabled={pending}
        onChange={(e) => {
          setName(e.target.value);
          sfx.tick();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setName("");
            setError(null);
          }
        }}
        placeholder="e.g. CMPT 307 · Algorithms"
        className="h-12 w-full rounded-sm border border-border-strong bg-bg-2 px-3 text-text placeholder:text-faint focus:border-signal focus:outline-none"
        aria-invalid={!!error}
        aria-describedby={error ? "new-module-error" : undefined}
      />
      {error && (
        <p id="new-module-error" className="animate-shake text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={pending} className="flex-1">
          {pending ? "Creating…" : "Create"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setName("");
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function EmptyState({ mascot }: { mascot: React.RefObject<MascotHandle | null> }) {
  return (
    <section className="card relative flex flex-col items-center gap-6 overflow-hidden px-6 py-12 text-center sm:py-16">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[color-mix(in_srgb,var(--signal)_8%,transparent)] to-transparent" />
      <Mascot ref={mascot} size={120} say="Create a Module for each subject you're studying." />
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl text-text">Your library is empty</h2>
        <p className="mx-auto max-w-md text-muted">
          A Module holds the files for one subject. Upload your slides, and we&apos;ll turn them into games you can
          dive, launch, leap and blitz through.
        </p>
      </div>
      <div className="w-full max-w-sm">
        <NewModuleCard big />
      </div>
    </section>
  );
}
