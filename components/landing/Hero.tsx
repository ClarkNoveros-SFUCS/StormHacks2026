"use client";
import { useEffect, useRef } from "react";
import { SignUpButton } from "@clerk/nextjs";
import { Button, Logo, Mascot, type MascotHandle } from "@/components/ui";
import { useReducedMotion } from "@/lib/motion/reduced";
import s from "./landing.module.css";

/**
 * Landing hero over the living sky: Logo, tagline, the two CTAs and Lumen floating over the
 * water. Content leans against the cursor (parallax); Lumen's eyes follow it and he reacts to
 * the CTAs.
 */
export function Hero() {
  const root = useRef<HTMLElement>(null);
  const lumen = useRef<MascotHandle>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = root.current;
    if (!el || reduced) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty("--px", ((e.clientX / window.innerWidth - 0.5) * 2).toFixed(3));
        el.style.setProperty("--py", ((e.clientY / window.innerHeight - 0.5) * 2).toFixed(3));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, [reduced]);

  useEffect(() => {
    const t = setTimeout(() => lumen.current?.say("Psst! Scroll down. It gets deep.", 4200), 1600);
    return () => clearTimeout(t);
  }, []);

  return (
    <section
      ref={root}
      aria-labelledby="hero-title"
      className="relative flex min-h-[calc(100svh-56px)] flex-col items-center justify-center overflow-hidden px-4 pt-10 pb-28 text-center"
    >
      {/* soft scrim so the type reads on any sky */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse 60% 45% at 50% 42%, rgba(5,7,15,.55), transparent 70%)" }}
      />
      <div className={`${s.parallax} relative flex flex-col items-center`}>
        <p className="mb-4 rounded-sm border border-border-strong bg-bg/60 px-3 py-1 font-display text-[12px] tracking-[0.25em] text-signal uppercase backdrop-blur">
          Study games from your own notes
        </p>
        <h1 id="hero-title" className="leading-none">
          <span className="sr-only">SYLLABYSS: </span>
          <Logo size="lg" />
        </h1>
        <p className="mt-5 max-w-xl text-[clamp(18px,2.6vw,22px)] text-text [text-shadow:0_2px_12px_rgba(0,0,0,.7)]">
          Turn your notes into games. <span className="text-reward">Rarer answers sink deeper.</span>
        </p>
        <div className="mt-9 flex w-full max-w-md flex-col items-stretch gap-4 sm:max-w-none sm:flex-row sm:items-center sm:justify-center">
          <SignUpButton mode="modal" forceRedirectUrl="/home">
            <Button
              variant="primary"
              size="lg"
              onMouseEnter={() => {
                lumen.current?.react("wow");
                lumen.current?.say("Ooh, yes. Come on down!", 2200);
              }}
            >
              Start playing — it&apos;s free
            </Button>
          </SignUpButton>
          <Button
            href="/daily"
            variant="secondary"
            size="lg"
            iconRight="▼"
          >
            Try today&apos;s Daily Dive
          </Button>
        </div>
      </div>

      <div className={`${s.parallaxDeep} pointer-events-none absolute right-[4%] bottom-[7%] origin-bottom-right scale-75 sm:right-[12%] sm:bottom-[16%] sm:scale-100`}>
        <div className="pointer-events-auto" style={{ animation: reduced ? undefined : "float 6s ease-in-out infinite" }}>
          <Mascot ref={lumen} size={112} bubbleSide="left" sleepAfterMs={45000} />
        </div>
      </div>

      <a
        href="#how"
        className={`${s.scrollCue} absolute bottom-6 left-1/2 -translate-x-1/2 rounded-sm px-2 py-1 font-display text-sm tracking-[0.2em] text-muted uppercase hover:text-text`}
      >
        ▼ scroll to dive ▼
      </a>
    </section>
  );
}
