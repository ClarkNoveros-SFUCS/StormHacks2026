"use client";
// The three.js canvas for Arena. Loads ./scene with a dynamic import (three.js stays out of the
// first bundle and off the server), pauses while the tab is hidden, follows reduced motion, and
// disposes everything on unmount. Commands sent before the scene has loaded are queued.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/motion/reduced";
import type { ArenaScene, ArenaShot } from "./scene";

export type ArenaStageHandle = { run: (fn: (scene: ArenaScene) => void) => void };

type Props = {
  mode: "play" | "showcase";
  onShot?: (shot: ArenaShot) => void;
  onLockChange?: (locked: boolean) => void;
  onReady?: () => void;
  onFailed?: () => void;
  className?: string;
};

export const ArenaStage = forwardRef<ArenaStageHandle, Props>(function ArenaStage({ mode, onShot, onLockChange, onReady, onFailed, className = "" }, ref) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ArenaScene | null>(null);
  const queue = useRef<((s: ArenaScene) => void)[]>([]);
  const cbs = useRef({ onShot, onLockChange, onReady, onFailed });
  const initialMode = useRef(mode);
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    cbs.current = { onShot, onLockChange, onReady, onFailed };
  }, [onShot, onLockChange, onReady, onFailed]);

  useImperativeHandle(ref, () => ({
    run: (fn) => {
      if (sceneRef.current) fn(sceneRef.current);
      else queue.current.push(fn);
    },
  }), []);

  useEffect(() => {
    let cancelled = false;
    let scene: ArenaScene | null = null;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const css = getComputedStyle(wrap);
    const font = (v: string, fallback: string) => css.getPropertyValue(v).trim() || fallback;
    const fonts = {
      display: font("--f-display", "monospace"),
      body: font("--f-body", "system-ui, sans-serif"),
      hud: font("--f-hud", "monospace"),
    };
    void import("./scene")
      .then(({ ArenaScene }) => {
        if (cancelled) return;
        try {
          scene = new ArenaScene(canvas, {
            reduced: reducedRef.current,
            fonts,
            mode: initialMode.current,
            onShot: (s) => cbs.current.onShot?.(s),
            onLockChange: (l) => cbs.current.onLockChange?.(l),
          });
        } catch {
          setState("failed");
          cbs.current.onFailed?.();
          return;
        }
        sceneRef.current = scene;
        for (const fn of queue.current.splice(0)) fn(scene);
        scene.step();
        if (document.hidden) scene.setPaused(true);
        if (process.env.NODE_ENV === "development") (window as unknown as { __arena?: ArenaScene }).__arena = scene;
        setState("ready");
        cbs.current.onReady?.();
      })
      .catch(() => {
        setState("failed");
        cbs.current.onFailed?.();
      });
    const onVis = () => sceneRef.current?.setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      scene?.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    reducedRef.current = reduced;
    sceneRef.current?.setReduced(reduced);
  }, [reduced]);

  return (
    <div ref={wrapRef} className={`absolute inset-0 ${className}`}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-700"
        style={{ background: "radial-gradient(ellipse at 50% 40%, #1b2242, #070914 70%)", opacity: state === "ready" ? 0 : 1 }}
      />
      <canvas
        ref={canvasRef}
        aria-label={mode === "play" ? "Arena: aim and click a target to shoot it" : undefined}
        aria-hidden={mode === "play" ? undefined : true}
        className="absolute inset-0 h-full w-full touch-none select-none"
        style={{ opacity: state === "failed" ? 0 : 1, cursor: mode === "play" ? "crosshair" : undefined }}
      />
      {state === "failed" && mode === "play" && (
        <p className="absolute inset-x-0 top-1/3 text-center font-hud text-[20px] text-muted">3D isn&apos;t available here · use keys 1–4 to shoot</p>
      )}
    </div>
  );
});
