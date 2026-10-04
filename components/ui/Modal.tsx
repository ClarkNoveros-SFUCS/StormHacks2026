"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { sfx } from "@/lib/ui/sfx";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
};

/** Close on Escape, trap Tab inside, restore focus on close, lock page scroll. */
function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sfx.whoosh();
    const focusables = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    requestAnimationFrame(() => (focusables()[0] ?? ref.current)?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
      } else if (e.key === "Tab") {
        const f = focusables();
        if (f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open]);
  return ref;
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="grid h-8 w-8 place-items-center rounded-sm text-muted transition hover:bg-surface-2 hover:text-text"
    >
      ✕
    </button>
  );
}

/** Centered dialog over a dimmed, blurred backdrop. Escape and the backdrop close it. */
export function Modal({ open, onClose, title, footer, children, className = "" }: Props) {
  const ref = useDialog(open, onClose);
  const id = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4" role="presentation">
      <div className="absolute inset-0 bg-[#03050c]/75 backdrop-blur-sm" style={{ animation: "page-in .2s both" }} onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? id : undefined}
        tabIndex={-1}
        className={`card relative max-h-[90vh] w-full max-w-lg overflow-auto border-border-strong bg-surface p-5 shadow-2xl ${className}`}
        style={{ animation: "pop-in .35s var(--ease-snap) both" }}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          {title ? (
            <h2 id={id} className="text-xl text-text">
              {title}
            </h2>
          ) : (
            <span />
          )}
          <CloseButton onClose={onClose} />
        </div>
        {children}
        {footer && <div className="mt-5 flex flex-wrap justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}

/** A side (or bottom, on mobile) sheet. Same behaviour as Modal. */
export function Drawer({
  open,
  onClose,
  title,
  footer,
  children,
  side = "right",
  className = "",
}: Props & { side?: "right" | "bottom" }) {
  const ref = useDialog(open, onClose);
  const id = useId();
  if (!open) return null;
  const pos =
    side === "right"
      ? "right-0 top-0 h-full w-full max-w-xl border-l"
      : "bottom-0 inset-x-0 max-h-[85vh] w-full rounded-t-lg border-t";
  return (
    <div className="fixed inset-0 z-[80]" role="presentation">
      <div className="absolute inset-0 bg-[#03050c]/70 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? id : undefined}
        tabIndex={-1}
        className={`absolute flex flex-col overflow-hidden border-border-strong bg-surface shadow-2xl ${pos} ${className}`}
        style={{ animation: `${side === "right" ? "drawer-right" : "drawer-up"} .35s var(--ease-out) both` }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
          {title ? (
            <h2 id={id} className="text-lg text-text">
              {title}
            </h2>
          ) : (
            <span />
          )}
          <CloseButton onClose={onClose} />
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
        {footer && <div className="flex justify-end gap-3 border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
