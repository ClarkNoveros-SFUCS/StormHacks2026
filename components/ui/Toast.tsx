"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { sfx } from "@/lib/ui/sfx";
import { PixelIcon, type PixelIconName } from "./PixelIcon";

export type ToastTone = "info" | "success" | "reward" | "danger";
export type ToastInput = { title: string; body?: string; tone?: ToastTone; icon?: PixelIconName; ms?: number };
type ToastItem = ToastInput & { id: number };

const Ctx = createContext<(t: ToastInput) => void>(() => {});

const TONE: Record<ToastTone, { ring: string; icon: PixelIconName }> = {
  info: { ring: "var(--signal)", icon: "bubble" },
  success: { ring: "var(--success)", icon: "check" },
  reward: { ring: "var(--reward)", icon: "star" },
  danger: { ring: "var(--danger)", icon: "cross" },
};

/** Wrap the app once (root layout). Then `const toast = useToast(); toast({ title })`. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((t: ToastInput) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-3), { ...t, id }]);
    if (t.tone === "reward") sfx.reward();
    else if (t.tone === "danger") sfx.error();
    else sfx.pop();
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), t.ms ?? 3800);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[90] flex flex-col items-center gap-2 px-4 sm:right-4 sm:left-auto sm:items-end"
      >
        {items.map((t) => {
          const tone = TONE[t.tone ?? "info"];
          return (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border bg-surface-2 px-4 py-3 shadow-2xl"
              style={{ borderColor: tone.ring, animation: "toast-in .35s var(--ease-snap) both" }}
            >
              <PixelIcon name={t.icon ?? tone.icon} size={22} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="font-display text-[15px] text-text">{t.title}</p>
                {t.body && <p className="text-sm text-muted">{t.body}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
