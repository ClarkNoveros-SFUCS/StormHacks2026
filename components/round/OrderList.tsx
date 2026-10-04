"use client";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { prefersReducedMotion } from "@/lib/motion/reduced";
import { sfx } from "@/lib/ui/sfx";

type Props = {
  items: string[];
  onChange: (order: string[]) => void;
  locked?: boolean;
  /** Once locked: the right order, to mark each row. */
  correctOrder?: string[] | null;
  className?: string;
};

type Drag = { from: number; startY: number; dy: number; rowH: number };

/** Put-in-order: drag rows (pointer) or use the ▲▼ buttons (keyboard). Rows settle with a spring. */
export function OrderList({ items, onChange, locked = false, correctOrder, className = "" }: Props) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);

  const target = drag ? Math.max(0, Math.min(items.length - 1, drag.from + Math.round(drag.dy / drag.rowH))) : -1;

  const settle = (index: number, fromPx: number) => {
    const el = rowRefs.current[index];
    if (!el || prefersReducedMotion() || Math.abs(fromPx) < 1) return;
    el.animate([{ transform: `translateY(${fromPx}px)` }, { transform: "translateY(0)" }], {
      duration: 420,
      easing: "cubic-bezier(.2,1.5,.4,1)",
    });
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onChange(next);
    sfx.pop();
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>, i: number) => {
    if (locked) return;
    const row = rowRefs.current[i];
    if (!row) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rowH = row.offsetHeight + 8;
    setDrag({ from: i, startY: e.clientY, dy: 0, rowH });
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    setDrag({ ...drag, dy: e.clientY - drag.startY });
  };
  const onPointerUp = () => {
    if (!drag) return;
    const to = target;
    const leftover = drag.dy - (to - drag.from) * drag.rowH;
    setDrag(null);
    if (to !== drag.from) move(drag.from, to);
    requestAnimationFrame(() => settle(to, leftover));
  };

  return (
    <ol className={`flex flex-col gap-2 ${className}`} aria-label="Put these in order">
      {items.map((item, i) => {
        let shift = 0;
        if (drag && i !== drag.from) {
          if (drag.from < i && i <= target) shift = -drag.rowH;
          if (target <= i && i < drag.from) shift = drag.rowH;
        }
        const dragging = drag?.from === i;
        const state = locked && correctOrder ? (correctOrder[i] === item ? "right" : "wrong") : null;
        const ring = state === "right" ? "var(--success)" : state === "wrong" ? "var(--danger)" : dragging ? "var(--signal)" : "var(--dive-rim, #1b3050)";
        return (
          <li
            key={item}
            ref={(el) => {
              rowRefs.current[i] = el;
            }}
            className="relative flex items-center gap-2 bg-[#0d1830] pr-2"
            style={{
              transform: `translateY(${dragging && drag ? drag.dy : shift}px)${dragging ? " scale(1.02)" : ""}`,
              transition: dragging ? "none" : "transform .25s var(--ease-out)",
              zIndex: dragging ? 2 : 1,
              boxShadow: `0 0 0 2px var(--bg), 0 0 0 4px ${ring}${dragging ? ", 0 10px 24px rgba(0,0,0,.5)" : ""}`,
            }}
          >
            <button
              type="button"
              disabled={locked}
              aria-label={`Drag ${item}`}
              onPointerDown={(e) => onPointerDown(e, i)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="flex min-h-11 flex-1 touch-none items-center gap-3 px-3 text-left font-hud text-[20px] text-text select-none disabled:cursor-default sm:text-[22px]"
              style={{ cursor: locked ? "default" : dragging ? "grabbing" : "grab" }}
            >
              <span className="w-5 text-signal tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1">{item}</span>
              {!locked && <span aria-hidden="true" className="text-faint">⋮⋮</span>}
              {state === "right" && <span className="text-success">✓</span>}
              {state === "wrong" && <span className="text-danger">✗</span>}
            </button>
            {!locked && (
              <span className="flex flex-col">
                <button type="button" aria-label={`Move ${item} up`} disabled={i === 0} onClick={() => move(i, i - 1)} className="px-1 font-hud text-[14px] leading-none text-muted hover:text-signal disabled:opacity-30">
                  ▲
                </button>
                <button type="button" aria-label={`Move ${item} down`} disabled={i === items.length - 1} onClick={() => move(i, i + 1)} className="px-1 font-hud text-[14px] leading-none text-muted hover:text-signal disabled:opacity-30">
                  ▼
                </button>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
