"use client";
// The three.js canvas for Apogee. Loads ./scene with a dynamic import (three.js stays out of the
// first bundle and never runs on the server), pauses while the tab is hidden, follows the
// reduced-motion setting, and disposes everything on unmount. Commands sent before the scene has
// loaded are queued and replayed.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/motion/reduced";
import { apogeeData, apogeeDisplay } from "./fonts";
import type { ApogeeFrame, ApogeeScene } from "./scene";

export type ApogeeStageHandle = {
  /** Run `fn` on the scene now, or as soon as it has loaded. */
  run: (fn: (scene: ApogeeScene) => void) => void;
};

type Props = {
  /** Where the rocket starts: on the pad, or already flying at this many points (a reload). */
  initialPoints: number;
  lifted: boolean;
  onFrame?: (f: ApogeeFrame) => void;
  onLandmark?: (index: number) => void;
  className?: string;
};

export const ApogeeStage = forwardRef<ApogeeStageHandle, Props>(function ApogeeStage({ initialPoints, lifted, onFrame, onLandmark, className = "" }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ApogeeScene | null>(null);
  const queue = useRef<((s: ApogeeScene) => void)[]>([]);
  const frameRef = useRef(onFrame);
  const landmarkRef = useRef(onLandmark);
  const initial = useRef({ initialPoints, lifted });
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    frameRef.current = onFrame;
    landmarkRef.current = onLandmark;
  }, [onFrame, onLandmark]);

  useImperativeHandle(ref, () => ({
    run: (fn) => {
      if (sceneRef.current) fn(sceneRef.current);
      else queue.current.push(fn);
    },
  }), []);

  useEffect(() => {
    let cancelled = false;
    let scene: ApogeeScene | null = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    void import("./scene")
      .then(({ ApogeeScene }) => {
        if (cancelled) return;
        try {
          scene = new ApogeeScene(canvas, {
            reduced: reducedRef.current,
            fonts: { display: apogeeDisplay.style.fontFamily, data: apogeeData.style.fontFamily },
            onFrame: (f) => frameRef.current?.(f),
            onLandmark: (i) => landmarkRef.current?.(i),
          });
        } catch {
          setFailed(true); // no WebGL: the Run still plays over the plain backdrop
          return;
        }
        scene.place(initial.current.initialPoints, initial.current.lifted);
        sceneRef.current = scene;
        for (const fn of queue.current.splice(0)) fn(scene);
        // Draw one frame now so a background tab still shows the world, then pause until visible.
        scene.step();
        if (document.hidden) scene.setPaused(true);
        if (process.env.NODE_ENV === "development") (window as unknown as { __apogee?: ApogeeScene }).__apogee = scene;
        setReady(true);
      })
      .catch(() => setFailed(true));
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
      {/* the backdrop shows while three.js loads (and stays if WebGL is unavailable) */}
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{
          background: "radial-gradient(120% 80% at 50% 110%, #2a3a5c 0%, #0d1530 45%, #04050c 100%)",
          opacity: ready && !failed ? 0 : 1,
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" style={{ cursor: "grab", opacity: failed ? 0 : 1 }} />
    </div>
  );
});
