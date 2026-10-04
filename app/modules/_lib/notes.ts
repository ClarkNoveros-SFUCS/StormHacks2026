"use client";
// Study notes for a parsed page (#75), fetched once per tab and shared by the file viewer and the
// Reveal's slide panel. Resolves null when they couldn't be written (not cached, so a retry can work).
import { api } from "./client";

const cache = new Map<string, Promise<string | null>>();

export function loadPageNotes(documentId: string, page: number): Promise<string | null> {
  const key = `${documentId}:${page}`;
  let p = cache.get(key);
  if (!p) {
    p = api<{ notesMd: string }>(`/api/documents/${documentId}/pages/${page}/notes`).then(
      (r) => r.notesMd,
      () => {
        cache.delete(key);
        return null;
      },
    );
    cache.set(key, p);
  }
  return p;
}
