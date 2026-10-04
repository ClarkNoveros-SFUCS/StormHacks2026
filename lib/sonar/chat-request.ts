// Sonar (F32): validates a POST /api/sonar/chat body. Pure.

import { contextFromPath } from "./context-path";
import type { PageContext } from "./types";

export const MAX_MESSAGE = 1000;

/** The page context is re-derived from context.path, so ids sent by the client are never trusted. */
export function parseChatRequest(
  body: unknown,
): { ok: true; message: string | undefined; context: PageContext } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Body must be { message?, context }" };
  const { message, context } = body as { message?: unknown; context?: unknown };
  if (!context || typeof context !== "object" || typeof (context as { path?: unknown }).path !== "string") {
    return { ok: false, error: "context.path must be a string" };
  }
  const path = (context as { path: string }).path;
  if (!path.startsWith("/") || path.length > 300) return { ok: false, error: "context.path must be a site path" };
  if (message !== undefined && message !== null && typeof message !== "string") return { ok: false, error: "message must be a string" };
  if (typeof message === "string" && message.length > MAX_MESSAGE) return { ok: false, error: `message is over ${MAX_MESSAGE} characters` };
  const text = typeof message === "string" && message.trim() ? message.trim() : undefined;
  return { ok: true, message: text, context: contextFromPath(path) };
}
