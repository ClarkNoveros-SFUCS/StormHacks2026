// Sonar drawer (#91): saved chats. Kept in the browser only (localStorage); each chat's id is also
// its server memory thread (POST /api/sonar/chat { chatId }). Pure apart from load/save.

import type { Action } from "./types";

export type ChatMsg =
  | { id: number; role: "player"; text: string }
  | { id: number; role: "sonar"; text: string; actions: Action[] }
  | { id: number; role: "error"; text: string; retry: string | null }
  | { id: number; role: "divider"; text: string };

export type Chat = { id: string; title: string; createdAt: number; updatedAt: number; msgs: ChatMsg[] };

export const CHATS_KEY = "sonar:chats";
export const CURRENT_KEY = "sonar:chat";
/** The single pre-#91 transcript (sessionStorage), moved into the first saved chat. */
export const LEGACY_KEY = "sonar:transcript";
export const MAX_CHATS = 30;
export const MAX_MSGS = 60;
const TITLE_LEN = 60;

export function newChatId(now = Date.now()): string {
  return `c${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function newChat(now = Date.now()): Chat {
  return { id: newChatId(now), title: "", createdAt: now, updatedAt: now, msgs: [] };
}

function clip(text: string): string {
  const one = text.replace(/[*`#>]/g, "").replace(/\s+/g, " ").trim();
  return one.length > TITLE_LEN ? `${one.slice(0, TITLE_LEN - 1).trimEnd()}…` : one;
}

/** The Player's first message, else the first sentence of Sonar's first reply. */
export function titleFor(msgs: ChatMsg[]): string {
  const asked = msgs.find((m) => m.role === "player");
  if (asked) return clip(asked.text);
  const reply = msgs.find((m) => m.role === "sonar");
  if (reply) return clip(reply.text.split(/(?<=[.!?])\s/)[0] ?? reply.text);
  return "";
}

/** Replaces one chat's messages, retitles it and moves it to the top. Chats left empty are dropped. */
export function withMsgs(chats: Chat[], id: string, msgs: ChatMsg[], now = Date.now()): Chat[] {
  const old = chats.find((c) => c.id === id) ?? { ...newChat(now), id };
  const kept = msgs.slice(-MAX_MSGS);
  const next: Chat = { ...old, msgs: kept, title: old.title || titleFor(kept), updatedAt: now };
  const rest = chats.filter((c) => c.id !== id && c.msgs.length > 0);
  return (next.msgs.length > 0 ? [next, ...rest] : rest).slice(0, MAX_CHATS);
}

/** Case-insensitive match on the title and every message's text. */
export function searchChats(chats: Chat[], q: string): Chat[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return chats;
  return chats.filter(
    (c) => c.title.toLowerCase().includes(needle) || c.msgs.some((m) => m.text.toLowerCase().includes(needle)),
  );
}

/** "Today 3:04 PM", "Yesterday", "Oct 2". */
export function whenLabel(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const n = new Date(now);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(n) - day(d)) / 86_400_000);
  if (diff === 0) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(d.getFullYear() !== n.getFullYear() && { year: "numeric" }) });
}

export function loadChats(): Chat[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CHATS_KEY);
    const chats = raw ? (JSON.parse(raw) as Chat[]) : [];
    if (Array.isArray(chats) && chats.length > 0) return chats;
    const legacy = window.sessionStorage.getItem(LEGACY_KEY);
    const msgs = legacy ? (JSON.parse(legacy) as ChatMsg[]) : [];
    window.sessionStorage.removeItem(LEGACY_KEY);
    return Array.isArray(msgs) && msgs.length > 0 ? withMsgs([], newChatId(), msgs) : [];
  } catch {
    return [];
  }
}

export function saveChats(chats: Chat[]) {
  try {
    window.localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
  } catch {
    /* private mode or full: chats just won't survive a reload */
  }
}
