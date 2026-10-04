"use client";
import { Button, Mascot } from "@/components/ui";

/** Nothing played yet: Lumen points the way to a first Module or the Python Basics course. */
export function EmptyJumpBackIn({ hasModules }: { hasModules: boolean }) {
  return (
    <div className="card flex flex-col items-center gap-5 bg-surface/95 p-6 text-center sm:flex-row sm:text-left">
      <Mascot size={84} mood="wow" followCursor sleepAfterMs={0} />
      <div className="flex-1">
        <h3 className="text-xl text-text">{hasModules ? "Your first Game is waiting" : "Nothing to jump back into yet"}</h3>
        <p className="mt-1 text-muted">
          {hasModules
            ? "Open a Module and make a Game from your notes, then come back here to pick up where you left off."
            : "Upload your slides to make a Module, or learn something new with the Python Basics course."}
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Button href="/modules" variant="primary">
            {hasModules ? "Open my Modules" : "Create a Module"}
          </Button>
          <Button href="/explore/python-basics" variant="secondary">
            Try Python Basics
          </Button>
        </div>
      </div>
    </div>
  );
}
