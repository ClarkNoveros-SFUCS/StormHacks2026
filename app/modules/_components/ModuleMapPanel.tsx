"use client";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { openSonar } from "@/lib/sonar/client";
import { studyHref } from "../_lib/files";
import type { MapPage, ModuleMap, PageStatus } from "../_lib/page-map";

// The Module page map (#90): one strip of page cells per file, coloured by how the Player does on
// the Prompts whose Evidence is that page, across every Game of the Module. Cells open the page's
// study notes; the weakest pages get Read and Drill.

const COLOR: Record<PageStatus, string> = {
  solid: "var(--success)",
  shaky: "var(--caution)",
  missing: "var(--danger)",
  untested: "transparent",
};
const LABEL: Record<PageStatus, string> = { solid: "Solid", shaky: "Shaky", missing: "Missing", untested: "Not tested yet" };

const pct = (x: number) => `${Math.round(x * 100)}%`;

function tally(p: MapPage) {
  const n = p.right + p.wrong + p.timeouts;
  return `${p.right}/${n} right${p.timeouts ? ` · ${p.timeouts} timeout${p.timeouts > 1 ? "s" : ""}` : ""}`;
}

export function ModuleMapPanel({ moduleId, map }: { moduleId: string; map: ModuleMap }) {
  if (map.files.length === 0) return null;
  return (
    <section aria-labelledby="map-title" className="card flex flex-col gap-4 p-4 sm:p-5">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h2 id="map-title" className="label-line flex-1 !text-[13px]">
          Your map
        </h2>
        {map.answers > 0 && (
          <p className="text-sm text-muted">
            <span className="font-hud text-lg text-signal">{pct(map.overall)}</span> right ·{" "}
            <span className="font-hud text-lg text-text">{map.answers}</span> answers
          </p>
        )}
      </header>

      {map.answers === 0 && (
        <p className="text-sm text-muted">Play a Game in this Module and each page you&apos;re tested on lights up here.</p>
      )}

      <div className="flex flex-col gap-4">
        {map.files.map((f) => (
          <div key={f.documentId} className="flex flex-col gap-2">
            <p className="flex items-baseline gap-2 text-sm">
              <span className="min-w-0 truncate font-medium text-text">{f.filename}</span>
              <span className="shrink-0 text-faint">{f.pages.length} pages</span>
            </p>
            <ol className="flex flex-wrap gap-[3px]" aria-label={`Pages of ${f.filename}`}>
              {f.pages.map((p) => {
                const label = `p.${p.pageNumber}${p.title ? ` ${p.title}` : ""}: ${LABEL[p.status]}${p.score !== null ? `, ${tally(p)}` : ""}`;
                return (
                  <li key={p.pageNumber}>
                    <Link
                      href={studyHref(moduleId, f.documentId, p.pageNumber)}
                      title={label}
                      aria-label={label}
                      className="block h-5 w-5 rounded-[2px] border border-border transition hover:scale-125 hover:border-text focus-visible:scale-125"
                      style={{
                        background: COLOR[p.status],
                        opacity: p.score === null ? 1 : 0.55 + 0.45 * Math.min(1, (p.right + p.wrong + p.timeouts) / 4),
                      }}
                    />
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted" aria-label="Legend">
        {(["solid", "shaky", "missing", "untested"] as const).map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[2px] border border-border" style={{ background: COLOR[s] }} />
            {LABEL[s]}
          </li>
        ))}
      </ul>

      {map.weakest.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="font-display text-[12px] tracking-[.2em] text-faint uppercase">Weakest pages</h3>
          <ul className="flex flex-col gap-2">
            {map.weakest.map((p) => (
              <li key={`${p.documentId}:${p.pageNumber}`} className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="h-3 w-3 shrink-0 rounded-[2px]" style={{ background: COLOR[p.status] }} aria-hidden="true" />
                <span className="min-w-0 flex-1 text-sm text-text">
                  <span className="font-hud text-signal">p.{p.pageNumber}</span> {p.title || p.filename}
                  <span className="block text-[12px] text-muted">
                    {map.files.length > 1 ? `${p.filename} · ` : ""}
                    {tally(p)}
                  </span>
                </span>
                <span className="flex gap-2">
                  <Link href={studyHref(moduleId, p.documentId, p.pageNumber)} className="px-btn h-8 px-3 text-[13px]" data-variant="secondary">
                    Read
                  </Link>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() =>
                      openSonar({ message: `Drill me on p.${p.pageNumber} of ${p.filename}${p.title ? ` (${p.title})` : ""}. What am I missing there?` })
                    }
                  >
                    Drill
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
