"use client";
// Client helpers for the Module page: polling, uploads with progress, small fetch wrapper.
import { useEffect, useRef } from "react";

/**
 * Calls `tick` every `ms` while `active`, waiting for each call to finish before scheduling the
 * next. Skips ticks while the tab is hidden.
 */
export function usePolling(active: boolean, ms: number, tick: () => Promise<void> | void) {
  const saved = useRef(tick);
  useEffect(() => {
    saved.current = tick;
  });
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let busy = false;
    const run = async () => {
      busy = true;
      if (document.visibilityState === "visible") {
        try {
          await saved.current();
        } catch {
          // network blip: try again next tick
        }
      }
      busy = false;
      if (!stopped) timer = setTimeout(run, ms);
    };
    timer = setTimeout(run, ms);
    // Catch up as soon as the tab comes back instead of waiting for the next tick.
    const onVisible = () => {
      if (document.visibilityState !== "visible" || stopped || busy) return;
      clearTimeout(timer);
      run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, ms]);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** fetch + JSON with the API's `{ error }` shape turned into an ApiError. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body?.error ?? `Something went wrong (${res.status})`, res.status);
  return body as T;
}

/** POSTs one file as multipart `file`, reporting upload progress 0–1. Resolves with the JSON body. */
export function uploadFile<T>(url: string, file: File, onProgress: (p: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      const body = xhr.response ?? {};
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(new ApiError(body?.error ?? `Upload failed (${xhr.status})`, xhr.status));
    };
    xhr.onerror = () => reject(new ApiError("Upload failed. Check your connection and try again.", 0));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}
