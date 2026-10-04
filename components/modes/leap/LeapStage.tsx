"use client";
// The three.js canvas for Leap. Loads ./scene with a dynamic import (three.js stays out of the
// first bundle and off the server), pauses while the tab is hidden, follows reduced motion, and
// disposes everything on unmount. Commands sent before the scene has loaded are queued.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/motion/reduced";
import type { LeapFrame, LeapScene } from "./scene";

export type LeapStageHandle = { run: (fn: (scene: LeapScene) => void) => void };

type Props = {
  count: number;
  /** The platform the hopper starts on (0 = the start island) and platforms already crumbled. */
  platform: number;
  crumbled: number[];
  onFrame?: (f: LeapFrame) => void;
  className?: string;
};

export const LeapStage = forwardRef<LeapStageHandle, Props>(function LeapStage({ count, platform, crumbled, onFrame, className = "" }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<LeapScene | null>(null);
  const queue = useRef<((s: LeapScene) => void)[]>([]);
  const frameRef = useRef(onFrame);
  const initial = useRef({ count, platform, crumbled });
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    frameRef.current = onFrame;
  }, [onFrame]);

  useImperativeHandle(ref, () => ({
    run: (fn) => {
      if (sceneRef.current) fn(sceneRef.current);
      else queue.current.push(fn);
    },
  }), []);

  useEffect(() => {
    let cancelled = false;
    let scene: LeapScene | null = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    void import("./scene")
      .then(({ LeapScene }) => {
        if (cancelled) return;
        try {
          scene = new LeapScene(canvas, { reduced: reducedRef.current, count: initial.current.count, onFrame: (f) => frameRef.current?.(f) });
        } catch {
          setState("failed");
          return;
        }
        scene.place(initial.current.platform, initial.current.crumbled);
        sceneRef.current = scene;
        for (const fn of queue.current.splice(0)) fn(scene);
        scene.step();
        if (document.hidden) scene.setPaused(true);
        if (process.env.NODE_ENV === "development") (window as unknown as { __leap?: LeapScene }).__leap = scene;
        setState("ready");
      })
      .catch(() => setState("failed"));
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
    <div className={`absolute inset-0 ${className}`} aria-hidden="true">
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{ background: "linear-gradient(#4aa8ff, #cdeeff 70%)", opacity: state === "ready" ? 0 : 1 }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ opacity: state === "failed" ? 0 : 1 }} />
    </div>
  );
});
