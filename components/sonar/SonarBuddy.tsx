"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { SONAR_OPEN_EVENT, openSonar, type SonarOpenDetail } from "@/lib/sonar/client";
import { contextFromPath, isRunScreen } from "@/lib/sonar/context-path";
import { FIXTURE_CHAT } from "@/lib/sonar/fixtures";
import type { Action, Bubble, BubbleResponse, ChatResponse } from "@/lib/sonar/types";
import { sfx } from "@/lib/ui/sfx";
import { ActionCard } from "./ActionCard";
import { LightMarkdown } from "./LightMarkdown";
import { SonarMascot, type SonarMood } from "./SonarMascot";
import s from "./sonar.module.css";

// Sonar's floating buddy (F32, #73): a dolphin button bottom-right on every signed-in site page
// (hidden during a Run), a chat drawer (right panel / bottom sheet), and a speech bubble on
// Reveal, Topic and Module pages. Spec: docs/architecture/sonar.md § Decisions Q4, Q10.

type Msg =
  | { id: number; role: "player"; text: string }
  | { id: number; role: "sonar"; text: string; actions: Action[] }
  | { id: number; role: "error"; text: string; retry: string | null };

const STORE = "sonar:transcript";
const SEEN = "sonar:bubbles";
const BUBBLE_KINDS = new Set(["reveal", "topic", "module"]);

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or full: the transcript just won't survive a reload */
  }
}

let nextId = Date.now();

export function SonarBuddy() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>(() => load<Msg[]>(STORE, []));
  const [pending, setPending] = useState(false);
  const [talking, setTalking] = useState(false);
  const [draft, setDraft] = useState("");
  const [bubble, setBubble] = useState<{ path: string; bubble: NonNullable<Bubble> } | null>(null);
  const msgsRef = useRef(msgs);
  const pathRef = useRef(pathname);
  const pendingRef = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const fab = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    msgsRef.current = msgs;
    save(STORE, msgs.slice(-40));
  }, [msgs]);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  const send = useCallback(async (message?: string, opts: { echo?: boolean } = {}) => {
    if (pendingRef.current) return;
    const text = message?.trim() || undefined;
    if (text && opts.echo !== false) setMsgs((m) => [...m, { id: ++nextId, role: "player", text }]);
    pendingRef.current = true;
    setPending(true);
    try {
      const res = await fetch("/api/sonar/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, context: contextFromPath(pathRef.current) }),
      });
      let body: ChatResponse;
      if (res.status === 404 && process.env.NODE_ENV === "development") {
        // The chat route isn't merged yet: answer with the demo reply so the UI can be built.
        await new Promise((r) => setTimeout(r, 900));
        body = FIXTURE_CHAT;
      } else if (!res.ok) {
        throw new Error(`chat ${res.status}`);
      } else {
        body = (await res.json()) as ChatResponse;
      }
      setMsgs((m) => [...m, { id: ++nextId, role: "sonar", text: body.reply, actions: body.actions ?? [] }]);
      sfx.pop();
      setTalking(true);
      setTimeout(() => setTalking(false), 1600);
    } catch {
      setMsgs((m) => [
        ...m,
        { id: ++nextId, role: "error", text: "My sonar lost the signal for a second. Want me to try again?", retry: text ?? null },
      ]);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }, []);

  const openDrawer = useCallback(
    (detail: SonarOpenDetail = {}) => {
      setOpen(true);
      sfx.unlock();
      if (detail.message) void send(detail.message);
      else if (msgsRef.current.length === 0) void send();
    },
    [send],
  );

  // "Ask Sonar" links and bubbles anywhere in the app.
  useEffect(() => {
    const on = (e: Event) => openDrawer((e as CustomEvent<SonarOpenDetail>).detail ?? {});
    window.addEventListener(SONAR_OPEN_EVENT, on);
    return () => window.removeEventListener(SONAR_OPEN_EVENT, on);
  }, [openDrawer]);

  // Keep the newest message in view; focus the input when the drawer opens.
  useEffect(() => {
    if (open) scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [open, msgs, pending]);
  useEffect(() => {
    if (!open) return;
    input.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        fab.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // The speech bubble: templated server-side, at most once per path per session.
  useEffect(() => {
    const ctx = contextFromPath(pathname);
    if (!BUBBLE_KINDS.has(ctx.kind) || isRunScreen(pathname)) return;
    const seen = load<string[]>(SEEN, []);
    if (seen.includes(ctx.path)) return;
    const ac = new AbortController();
    fetch(`/api/sonar/bubble?path=${encodeURIComponent(pathname)}`, { signal: ac.signal })
      .then((r) => (r.ok ? (r.json() as Promise<BubbleResponse>) : null))
      .then((b) => {
        if (!b?.bubble) return;
        save(SEEN, [...seen, ctx.path].slice(-50));
        setBubble({ path: pathname, bubble: b.bubble });
      })
      .catch(() => {});
    return () => ac.abort();
  }, [pathname]);

  if (isRunScreen(pathname)) return null;

  const mood: SonarMood = pending ? "thinking" : talking ? "talking" : "idle";
  const shownBubble = !open && bubble?.path === pathname ? bubble.bubble : null;
  const toneColor = shownBubble?.tone === "alert" ? "var(--caution)" : shownBubble?.tone === "cheer" ? "var(--success)" : "var(--signal)";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = draft.trim();
    if (!t || pending) return;
    setDraft("");
    void send(t);
  };

  return (
    <>
      {/* Floating button + bubble. Sits above the page (z-60) but under dialogs and the nav sheet (z-80). */}
      {!open && (
        <div className="pointer-events-none fixed right-3 bottom-3 z-[60] flex items-end gap-2 sm:right-5 sm:bottom-5">
          {shownBubble && (
            <div
              className={`pointer-events-auto relative mb-6 max-w-[min(260px,calc(100vw-120px))] rounded-md border-2 bg-surface-2 shadow-xl ${s.bubbleIn}`}
              style={{ borderColor: toneColor }}
            >
              <button
                type="button"
                onClick={() => {
                  setBubble(null);
                  openSonar({ message: shownBubble.prompt });
                }}
                className="block w-full px-3 py-2 pr-7 text-left font-display text-[13px] leading-snug text-text"
              >
                {shownBubble.text}
                <span className="mt-1 block text-[12px] text-signal">Ask Sonar →</span>
              </button>
              <button
                type="button"
                aria-label="Dismiss Sonar's tip"
                onClick={() => setBubble(null)}
                className="absolute top-1 right-1 grid h-6 w-6 place-items-center rounded-sm text-faint hover:text-text"
              >
                ×
              </button>
              <span
                aria-hidden="true"
                className="absolute -right-[7px] bottom-4 h-3 w-3 rotate-45 border-t-2 border-r-2 bg-surface-2"
                style={{ borderColor: toneColor }}
              />
            </div>
          )}
          <button
            ref={fab}
            type="button"
            onClick={() => openDrawer()}
            aria-label="Open Sonar, your study coach"
            aria-haspopup="dialog"
            className={`pointer-events-auto grid h-16 w-16 place-items-center rounded-full border-2 border-border-strong bg-surface shadow-2xl ${s.fab} ${shownBubble ? s.fabHalo : ""}`}
          >
            <SonarMascot size={48} mood={mood} />
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[80]" role="presentation">
          <div className="absolute inset-0 bg-[#03050c]/60 backdrop-blur-[2px] sm:bg-[#03050c]/30" onClick={() => setOpen(false)} />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="sonar-title"
            className={`absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-lg border-t-2 border-border-strong bg-surface shadow-2xl sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[420px] sm:rounded-none sm:border-t-0 sm:border-l-2 ${s.panel}`}
          >
            <header className="relative flex items-center gap-3 overflow-hidden border-b border-border bg-[linear-gradient(180deg,#0b1a36,#0f1326)] px-4 py-3">
              <SonarMascot size={96} mood={mood} />
              <div className="min-w-0 flex-1">
                <h2 id="sonar-title" className="font-display text-2xl text-text">
                  Sonar
                </h2>
                <p className="text-[13px] text-muted">{pending ? "Pinging your map…" : "Your study coach"}</p>
                <Link
                  href="/sonar"
                  onClick={() => setOpen(false)}
                  className="mt-1 inline-block font-display text-[14px] text-signal underline-offset-4 hover:underline"
                >
                  Open your map →
                </Link>
              </div>
              <button
                type="button"
                aria-label="Close Sonar"
                onClick={() => {
                  setOpen(false);
                  fab.current?.focus();
                }}
                className="grid h-9 w-9 place-items-center self-start rounded-sm border border-border text-muted hover:border-border-strong hover:text-text"
              >
                ×
              </button>
            </header>

            <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
              {msgs.length === 0 && !pending && (
                <p className="text-center text-[14px] text-muted">Ask me anything about what you&apos;re studying.</p>
              )}
              {msgs.map((m) =>
                m.role === "player" ? (
                  <div key={m.id} className="ml-10 rounded-md rounded-br-none bg-primary/90 px-3 py-2 text-[15px] text-primary-text">
                    {m.text}
                  </div>
                ) : m.role === "sonar" ? (
                  <div key={m.id} className="mr-6 space-y-2">
                    <div className="rounded-md rounded-bl-none border border-border bg-surface-2 px-3 py-2 text-[15px] leading-relaxed text-text">
                      <LightMarkdown text={m.text} />
                    </div>
                    {m.actions.map((a, i) => (
                      <ActionCard key={i} action={a} index={i} onNavigate={() => setOpen(false)} />
                    ))}
                  </div>
                ) : (
                  <div key={m.id} className="mr-6 rounded-md border border-caution/50 bg-caution/10 px-3 py-2 text-[14px] text-text">
                    {m.text}{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setMsgs((xs) => xs.filter((x) => x.id !== m.id));
                        void send(m.retry ?? undefined, { echo: false });
                      }}
                      className="font-display text-caution underline underline-offset-4"
                    >
                      Retry
                    </button>
                  </div>
                ),
              )}
              {pending && (
                <div className="mr-6 inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-3 py-2" aria-label="Sonar is thinking">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-2 w-2 rounded-full bg-signal animate-dot-pulse" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={submit} className="flex gap-2 border-t border-border bg-bg-2 p-3">
              <label htmlFor="sonar-input" className="sr-only">
                Message Sonar
              </label>
              <input
                id="sonar-input"
                ref={input}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Why am I missing loops?"
                autoComplete="off"
                maxLength={500}
                className="h-11 min-w-0 flex-1 rounded-sm border border-border bg-bg px-3 text-[15px] text-text placeholder:text-faint focus:border-signal focus:outline-none"
              />
              <button
                type="submit"
                disabled={pending || !draft.trim()}
                className="px-btn h-11 px-4 text-[15px]"
                data-variant="primary"
              >
                Send
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
