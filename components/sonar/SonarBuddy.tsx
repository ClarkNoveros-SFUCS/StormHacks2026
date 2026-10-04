"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { CURRENT_KEY, loadChats, newChatId, saveChats, searchChats, whenLabel, withMsgs, type Chat, type ChatMsg } from "@/lib/sonar/chats";
import { SONAR_OPEN_EVENT, openSonar, type SonarOpenDetail } from "@/lib/sonar/client";
import { contextFromPath, isRunScreen } from "@/lib/sonar/context-path";
import { FIXTURE_CHAT } from "@/lib/sonar/fixtures";
import type { Bubble, BubbleResponse, ChatResponse } from "@/lib/sonar/types";
import { sfx } from "@/lib/ui/sfx";
import { ActionCard } from "./ActionCard";
import { LightMarkdown } from "./LightMarkdown";
import { SonarMascot, type SonarMood } from "./SonarMascot";
import s from "./sonar.module.css";

// Sonar's floating buddy (F32, #73): a dolphin button bottom-right on every signed-in site page
// (hidden during a Run), a chat drawer (right panel / bottom sheet), and a speech bubble on
// Reveal, Topic and Module pages. Spec: docs/architecture/sonar.md § Decisions Q4, Q10.
// #91: the drawer resizes by dragging its edge (top edge on phones), keeps a history of chats (lib/sonar/chats.ts, this
// browser only; each chat is its own server memory thread) and shows replies as a chat with avatars.

type Msg = ChatMsg;

const SEEN = "sonar:bubbles";
const BRIEFED = "sonar:briefed";
const SIZE = "sonar:size";
/** Drawer width on wider screens / sheet height on phones, in px. */
const DEFAULT_W = 440;
const MIN_W = 360;
const MIN_H = 280;
const BUBBLE_KINDS = new Set(["reveal", "topic", "module"]);
/** Pages that get a fresh briefing when the drawer opens there after a chat on another page. */
const REBRIEF_KINDS: Record<string, string> = { reveal: "this Run", topic: "this Topic", module: "this Module", game: "this Game" };

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
function loadLocal(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function saveLocal(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* fine: a per-browser convenience */
  }
}

let nextId = Date.now();

export function SonarBuddy() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [chats, setChats] = useState<Chat[]>(() => loadChats());
  const [chatId, setChatId] = useState<string>(() => {
    const saved = loadLocal(CURRENT_KEY);
    const list = loadChats();
    return saved && list.some((c) => c.id === saved) ? saved : (list[0]?.id ?? newChatId());
  });
  const [pendingIn, setPendingIn] = useState<string | null>(null);
  const [talking, setTalking] = useState(false);
  const [draft, setDraft] = useState("");
  const [size, setSize] = useState<{ w: number; h: number }>(() => {
    try {
      const v = JSON.parse(loadLocal(SIZE) ?? "{}") as { w?: number; h?: number };
      return { w: Number(v.w) || DEFAULT_W, h: Number(v.h) || 0 };
    } catch {
      return { w: DEFAULT_W, h: 0 };
    }
  });
  const [desktop, setDesktop] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const [copied, setCopied] = useState<number | null>(null);
  const [bubble, setBubble] = useState<{ path: string; bubble: NonNullable<Bubble> } | null>(null);

  const msgs = useMemo(() => chats.find((c) => c.id === chatId)?.msgs ?? [], [chats, chatId]);
  const chat = chats.find((c) => c.id === chatId);
  const pending = pendingIn !== null;

  const msgsRef = useRef(msgs);
  const chatRef = useRef(chatId);
  const pathRef = useRef(pathname);
  const pendingRef = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
  const lastTop = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const fab = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    msgsRef.current = msgs;
  }, [msgs]);
  useEffect(() => {
    saveChats(chats);
  }, [chats]);
  useEffect(() => {
    chatRef.current = chatId;
    saveLocal(CURRENT_KEY, chatId);
  }, [chatId]);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  useEffect(() => {
    if (!dragging) saveLocal(SIZE, JSON.stringify(size));
  }, [size, dragging]);

  /** Updates one chat's messages, even if the Player has switched to another chat meanwhile. */
  const update = useCallback((id: string, fn: (m: Msg[]) => Msg[]) => {
    setChats((cs) => withMsgs(cs, id, fn(cs.find((c) => c.id === id)?.msgs ?? [])));
  }, []);

  const send = useCallback(
    async (message?: string, opts: { echo?: boolean } = {}) => {
      if (pendingRef.current) return;
      const id = chatRef.current;
      save(BRIEFED, contextFromPath(pathRef.current).path);
      const text = message?.trim() || undefined;
      if (text && opts.echo !== false) update(id, (m) => [...m, { id: ++nextId, role: "player", text }]);
      pendingRef.current = true;
      setPendingIn(id);
      setAtBottom(true);
      try {
        const res = await fetch("/api/sonar/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: text, context: contextFromPath(pathRef.current), chatId: id }),
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
        update(id, (m) => [...m, { id: ++nextId, role: "sonar", text: body.reply, actions: body.actions ?? [] }]);
        sfx.pop();
        setTalking(true);
        setTimeout(() => setTalking(false), 1600);
      } catch {
        update(id, (m) => [
          ...m,
          { id: ++nextId, role: "error", text: "My sonar lost the signal for a second. Want me to try again?", retry: text ?? null },
        ]);
      } finally {
        pendingRef.current = false;
        setPendingIn(null);
      }
    },
    [update],
  );

  const openDrawer = useCallback(
    (detail: SonarOpenDetail = {}) => {
      setOpen(true);
      setAtBottom(true);
      sfx.unlock();
      if (detail.message) void send(detail.message);
      else if (msgsRef.current.length === 0) void send();
      else {
        // A chat from another page: brief again for this one, under a divider.
        const ctx = contextFromPath(pathRef.current);
        const label = REBRIEF_KINDS[ctx.kind];
        if (label && load<string | null>(BRIEFED, null) !== ctx.path && !pendingRef.current) {
          update(chatRef.current, (m) => [...m, { id: ++nextId, role: "divider", text: `Now on ${label}` }]);
          void send();
        }
      }
    },
    [send, update],
  );

  const close = useCallback(() => {
    setOpen(false);
    setHistoryOpen(false);
    fab.current?.focus();
  }, []);

  const startChat = useCallback(() => {
    if (pendingRef.current) return;
    const id = newChatId();
    chatRef.current = id;
    setChatId(id);
    setHistoryOpen(false);
    setQuery("");
    setDraft("");
    void send();
    input.current?.focus({ preventScroll: true });
  }, [send]);

  const switchTo = (id: string) => {
    chatRef.current = id;
    setChatId(id);
    setHistoryOpen(false);
    setQuery("");
    setAtBottom(true);
    input.current?.focus({ preventScroll: true });
  };

  const remove = (id: string) => {
    const rest = chats.filter((c) => c.id !== id);
    setChats(rest);
    if (id === chatId) {
      const next = rest[0]?.id ?? newChatId();
      chatRef.current = next;
      setChatId(next);
    }
  };

  // "Ask Sonar" links and bubbles anywhere in the app.
  useEffect(() => {
    const on = (e: Event) => openDrawer((e as CustomEvent<SonarOpenDetail>).detail ?? {});
    window.addEventListener(SONAR_OPEN_EVENT, on);
    return () => window.removeEventListener(SONAR_OPEN_EVENT, on);
  }, [openDrawer]);

  // Follow new messages unless the Player has scrolled up to read; then offer "Jump to latest".
  useEffect(() => {
    if (open && atBottom) scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [open, msgs, pendingIn, atBottom]);
  // Resizing reflows the text: stay pinned to the bottom if that's where the Player was.
  useEffect(() => {
    if (open && atBottom) scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [open, atBottom, size]);
  useEffect(() => {
    if (open) scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [open, chatId]);
  useEffect(() => {
    if (!open) return;
    if (historyOpen) search.current?.focus({ preventScroll: true });
    else input.current?.focus({ preventScroll: true });
  }, [open, historyOpen]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (historyOpen) setHistoryOpen(false);
      else close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, historyOpen, close]);

  // Grow the box with what's typed, up to about six lines.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft, open]);

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
  const found = searchChats(chats, query);
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const width = Math.max(MIN_W, Math.min(size.w, vw - 24));
  const height = size.h ? Math.max(MIN_H, Math.min(size.h, vh)) : Math.round(vh * 0.88);
  const column = desktop && width >= 680 ? "mx-auto w-full max-w-3xl" : "w-full";

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const t = draft.trim();
    if (!t || pending) return;
    setDraft("");
    void send(t);
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };
  const copy = (m: Msg) => {
    void navigator.clipboard?.writeText(m.text).then(() => {
      setCopied(m.id);
      setTimeout(() => setCopied((c) => (c === m.id ? null : c)), 1400);
    });
  };
  /** Drag the drawer's free edge: the left edge on wider screens, the top edge on phones. */
  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    setDragging(true);
    const move = (ev: PointerEvent) =>
      setSize((sz) =>
        desktop
          ? { ...sz, w: Math.max(MIN_W, Math.min(window.innerWidth - ev.clientX, window.innerWidth - 24)) }
          : { ...sz, h: Math.max(MIN_H, Math.min(window.innerHeight - ev.clientY, window.innerHeight)) },
      );
    const up = () => {
      setDragging(false);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };
  const resizeKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 96 : 32;
    const grow: Record<string, number> = desktop ? { ArrowLeft: step, ArrowRight: -step } : { ArrowUp: step, ArrowDown: -step };
    const d = grow[e.key];
    if (d === undefined) return;
    e.preventDefault();
    setSize((sz) => (desktop ? { ...sz, w: width + d } : { ...sz, h: height + d }));
  };
  const resetSize = () => setSize({ w: DEFAULT_W, h: 0 });

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
          <div className="absolute inset-0 bg-[#03050c]/60 backdrop-blur-[2px] sm:bg-[#03050c]/30" onClick={close} />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="sonar-title"
            className={`absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-lg border-t-2 border-border-strong bg-surface shadow-2xl sm:inset-y-0 sm:right-0 sm:left-auto sm:rounded-none sm:border-t-0 sm:border-l-2 ${
              dragging ? "select-none" : ""
            } ${s.panel}`}
            style={desktop ? { width } : { height }}
          >
            {/* Resize grip: drag, arrow keys, or double-click to reset. */}
            <div
              role="separator"
              aria-orientation={desktop ? "vertical" : "horizontal"}
              aria-label="Resize the chat"
              aria-valuenow={desktop ? width : height}
              aria-valuemin={desktop ? MIN_W : MIN_H}
              aria-valuemax={desktop ? vw - 24 : vh}
              tabIndex={0}
              title="Drag to resize · double-click to reset"
              onPointerDown={startResize}
              onKeyDown={resizeKey}
              onDoubleClick={resetSize}
              className={`group absolute z-20 touch-none ${
                desktop ? "inset-y-0 left-0 w-3 -translate-x-1/2 cursor-col-resize" : "inset-x-0 top-0 h-5 cursor-row-resize"
              }`}
            >
              <span
                aria-hidden="true"
                className={`absolute rounded-full transition-colors ${dragging ? "bg-signal" : "bg-border-strong group-hover:bg-signal group-focus-visible:bg-signal"} ${
                  desktop ? "top-1/2 left-1/2 h-12 w-1 -translate-x-1/2 -translate-y-1/2" : "top-1.5 left-1/2 h-1 w-10 -translate-x-1/2"
                }`}
              />
            </div>
            <header className="relative flex items-center gap-3 overflow-hidden border-b border-border bg-[linear-gradient(180deg,#0b1a36,#0f1326)] px-4 pt-5 pb-3 sm:pt-3">
              <SonarMascot size={72} mood={mood} />
              <div className="min-w-0 flex-1">
                <h2 id="sonar-title" className="font-display text-2xl leading-tight text-text">
                  Sonar
                </h2>
                <p className="flex items-center gap-1.5 text-[13px] text-muted">
                  <span className={`h-2 w-2 rounded-full ${pending ? "bg-signal animate-dot-pulse" : "bg-success"}`} aria-hidden="true" />
                  {pending ? "Pinging your map…" : "Your study coach"}
                </p>
                <Link
                  href="/sonar"
                  onClick={() => setOpen(false)}
                  className="mt-0.5 inline-block font-display text-[13px] text-signal underline-offset-4 hover:underline"
                >
                  Open your map →
                </Link>
              </div>
              <div className="flex gap-1.5 self-start">
                <button type="button" aria-label="Close Sonar" title="Close" onClick={close} className={iconBtn}>
                  <Icon name="close" />
                </button>
              </div>
            </header>

            {/* Chat bar: which chat this is (opens the history) and a new chat. */}
            <div className="relative flex items-center gap-2 border-b border-border bg-bg-2/70 px-3 py-2">
              <button
                type="button"
                onClick={() => setHistoryOpen((h) => !h)}
                aria-expanded={historyOpen}
                aria-controls="sonar-history"
                className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-surface-2"
              >
                <Icon name="history" />
                <span className="min-w-0 flex-1 truncate text-[14px] text-text">{chat?.title || "New chat"}</span>
                <span className="hidden text-[12px] text-faint sm:inline">
                  {chats.length} {chats.length === 1 ? "chat" : "chats"}
                </span>
                <span className={`text-faint transition-transform ${historyOpen ? "rotate-180" : ""}`}>
                  <Icon name="chevron" />
                </span>
              </button>
              <button
                type="button"
                onClick={startChat}
                disabled={pending}
                aria-label="Start a new chat"
                title="New chat"
                className={`${iconBtn} disabled:opacity-40`}
              >
                <Icon name="plus" />
              </button>

              {historyOpen && (
                <div
                  id="sonar-history"
                  className={`absolute inset-x-2 top-full z-10 mt-1 flex max-h-[min(420px,60dvh)] flex-col overflow-hidden rounded-md border border-border-strong bg-surface shadow-2xl ${s.historyIn}`}
                >
                  <div className="flex items-center justify-between gap-2 px-3 pt-3">
                    <span className="font-display text-[13px] tracking-widest text-muted uppercase">Chat history</span>
                    <button type="button" onClick={startChat} disabled={pending} className="px-btn h-8 px-2.5 text-[13px]" data-variant="primary">
                      <Icon name="plus" /> New
                    </button>
                  </div>
                  <label className="mx-3 mt-2 flex items-center gap-2 rounded-sm border border-border bg-bg px-2.5 focus-within:border-signal">
                    <span className="text-faint">
                      <Icon name="search" />
                    </span>
                    <span className="sr-only">Search chats</span>
                    <input
                      ref={search}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search chats…"
                      className={`h-9 min-w-0 flex-1 bg-transparent text-[14px] text-text placeholder:text-faint focus:outline-none ${s.bare}`}
                    />
                  </label>
                  <ul className="mt-2 min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
                    {found.length === 0 && (
                      <li className="px-3 py-6 text-center text-[13px] text-faint">
                        {chats.length === 0 ? "No saved chats yet." : "No chats match."}
                      </li>
                    )}
                    {found.map((c) => (
                      <li key={c.id} className="group relative">
                        <button
                          type="button"
                          onClick={() => switchTo(c.id)}
                          aria-current={c.id === chatId ? "true" : undefined}
                          className={`flex w-full items-start gap-2.5 rounded-sm px-2.5 py-2 pr-10 text-left hover:bg-surface-2 ${
                            c.id === chatId ? "bg-surface-2" : ""
                          }`}
                        >
                          <span className={`mt-0.5 ${c.id === chatId ? "text-signal" : "text-faint"}`}>
                            <Icon name="bubble" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] text-text">{c.title || "Untitled chat"}</span>
                            <span className="block text-[12px] text-faint">
                              {whenLabel(c.updatedAt)} · {c.msgs.filter((m) => m.role === "player" || m.role === "sonar").length} messages
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(c.id)}
                          aria-label={`Delete the chat ${c.title || "Untitled chat"}`}
                          title="Delete chat"
                          className="absolute top-2 right-1.5 grid h-7 w-7 place-items-center rounded-sm text-faint opacity-100 transition hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] hover:text-danger sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                        >
                          <Icon name="trash" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="border-t border-border px-3 py-2 text-[11px] text-faint">Saved in this browser only.</p>
                </div>
              )}
            </div>

            <div className="relative min-h-0 flex-1">
              <div
                ref={scroller}
                onScroll={(e) => {
                  // Only scrolling up stops the follow, so a smooth scroll to the bottom never trips it.
                  const el = e.currentTarget;
                  if (el.scrollHeight - el.scrollTop - el.clientHeight < 48) setAtBottom(true);
                  else if (el.scrollTop < lastTop.current - 2) setAtBottom(false);
                  lastTop.current = el.scrollTop;
                }}
                className="h-full overflow-y-auto px-4 py-4"
                aria-live="polite"
              >
                <div className={`${column} space-y-4`}>
                  {msgs.length === 0 && pendingIn !== chatId && (
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                      <SonarMascot size={88} mood="idle" />
                      <p className="font-display text-text">New chat</p>
                      <p className="max-w-xs text-[14px] text-muted">Ask me anything about what you&apos;re studying.</p>
                    </div>
                  )}
                  {msgs.map((m) =>
                    m.role === "player" ? (
                      <div key={m.id} className={`flex justify-end ${s.msgIn}`}>
                        <div className="max-w-[85%] rounded-lg rounded-br-sm bg-primary px-3.5 py-2 text-[15px] whitespace-pre-wrap text-primary-text shadow-[0_2px_0_var(--primary-drop)]">
                          {m.text}
                        </div>
                      </div>
                    ) : m.role === "sonar" ? (
                      <div key={m.id} className={`group flex gap-2.5 ${s.msgIn}`}>
                        <Avatar />
                        <div className="min-w-0 flex-1 space-y-2">
                          <span className="block font-display text-[12px] tracking-wide text-signal">Sonar</span>
                          <div className="rounded-lg rounded-tl-sm border border-border bg-surface-2 px-3.5 py-2.5 text-[15px] leading-relaxed text-text">
                            <LightMarkdown text={m.text} />
                          </div>
                          {m.actions.map((a, i) => (
                            <ActionCard key={i} action={a} index={i} onNavigate={() => setOpen(false)} />
                          ))}
                          <div className="flex gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                            <button
                              type="button"
                              onClick={() => copy(m)}
                              aria-label="Copy Sonar's reply"
                              title="Copy"
                              className="grid h-7 w-7 place-items-center rounded-sm text-faint hover:bg-surface-2 hover:text-text"
                            >
                              <Icon name={copied === m.id ? "check" : "copy"} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : m.role === "divider" ? (
                      <div key={m.id} className="flex items-center gap-2 text-[12px] text-faint" role="separator">
                        <span className="h-px flex-1 bg-border" />
                        {m.text}
                        <span className="h-px flex-1 bg-border" />
                      </div>
                    ) : (
                      <div key={m.id} className={`flex gap-2.5 ${s.msgIn}`}>
                        <Avatar />
                        <div className="min-w-0 flex-1 rounded-lg rounded-tl-sm border border-caution/50 bg-caution/10 px-3.5 py-2 text-[14px] text-text">
                          {m.text}{" "}
                          <button
                            type="button"
                            onClick={() => {
                              update(chatId, (xs) => xs.filter((x) => x.id !== m.id));
                              void send(m.retry ?? undefined, { echo: false });
                            }}
                            className="font-display text-caution underline underline-offset-4"
                          >
                            Retry
                          </button>
                        </div>
                      </div>
                    ),
                  )}
                  {pendingIn === chatId && (
                    <div className={`flex gap-2.5 ${s.msgIn}`}>
                      <Avatar mood="thinking" />
                      <div className="inline-flex items-center gap-1 self-end rounded-lg rounded-tl-sm border border-border bg-surface-2 px-3.5 py-3" aria-label="Sonar is thinking">
                        {[0, 1, 2].map((i) => (
                          <span key={i} className="h-2 w-2 rounded-full bg-signal animate-dot-pulse" style={{ animationDelay: `${i * 0.15}s` }} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {!atBottom && msgs.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setAtBottom(true);
                    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
                  }}
                  className={`absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3.5 py-1.5 text-[13px] text-text shadow-xl hover:border-signal ${s.bubbleIn}`}
                >
                  <Icon name="down" /> Jump to latest
                </button>
              )}
            </div>

            <form onSubmit={submit} className="border-t border-border bg-bg-2 p-3">
              <div className={`${column} flex items-end gap-2 rounded-md border border-border bg-bg p-1.5 pl-3 focus-within:border-signal`}>
                <label htmlFor="sonar-input" className="sr-only">
                  Message Sonar
                </label>
                <textarea
                  id="sonar-input"
                  ref={input}
                  rows={1}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Ask Sonar anything…"
                  autoComplete="off"
                  maxLength={1000}
                  className={`max-h-40 min-h-9 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-6 text-text placeholder:text-faint focus:outline-none ${s.bare}`}
                />
                <button
                  type="submit"
                  disabled={pending || !draft.trim()}
                  aria-label="Send"
                  title="Send"
                  className="px-btn h-9 w-10 shrink-0 px-0"
                  data-variant="primary"
                >
                  <Icon name="send" />
                </button>
              </div>
              <p className={`${column} mt-1.5 hidden text-[11px] text-faint sm:block`}>Enter to send · Shift+Enter for a new line</p>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

const iconBtn =
  "grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-border text-muted transition hover:border-border-strong hover:text-text";

function Avatar({ mood = "idle" }: { mood?: SonarMood }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border-strong bg-[radial-gradient(circle_at_50%_35%,#16305e,#0b1a36)]" aria-hidden="true">
      <SonarMascot size={28} mood={mood} />
    </span>
  );
}

type IconName = "close" | "history" | "chevron" | "plus" | "search" | "bubble" | "trash" | "copy" | "check" | "down" | "send";

/** Small square-capped line icons that sit with the pixel UI. */
function Icon({ name }: { name: IconName }) {
  const d: Record<IconName, string> = {
    close: "M5 5l14 14M19 5 5 19",
    history: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2",
    chevron: "M6 9l6 6 6-6",
    plus: "M12 5v14M5 12h14",
    search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4",
    bubble: "M4 5h16v11H9l-5 4Z",
    trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
    copy: "M9 9h11v11H9ZM5 15H4V4h11v1",
    check: "M5 12l5 5 9-10",
    down: "M12 5v14M6 13l6 6 6-6",
    send: "M12 19V5M6 11l6-6 6 6",
  };
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
      <path d={d[name]} />
    </svg>
  );
}
