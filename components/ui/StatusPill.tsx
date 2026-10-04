export type Status = "uploading" | "parsing" | "generating" | "ready" | "failed";

const META: Record<Status, { label: string; color: string; live: boolean }> = {
  uploading: { label: "Uploading", color: "var(--signal)", live: true },
  parsing: { label: "Parsing…", color: "var(--signal)", live: true },
  generating: { label: "Generating…", color: "var(--violet)", live: true },
  ready: { label: "Ready", color: "var(--success)", live: false },
  failed: { label: "Failed", color: "var(--danger)", live: false },
};

/** File / Game status. Live states pulse; Failed shows its message (no Retry, ADR-0003). */
export function StatusPill({ status, message }: { status: Status; message?: string }) {
  const m = META[status];
  return (
    <span className="inline-flex max-w-full items-center gap-2" title={message}>
      <span
        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-display text-[12px] whitespace-nowrap"
        style={{
          color: m.color,
          borderColor: `color-mix(in srgb, ${m.color} 40%, transparent)`,
          background: `color-mix(in srgb, ${m.color} 10%, transparent)`,
        }}
      >
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: m.color, animation: m.live ? "dot-pulse 1.4s ease-in-out infinite" : undefined }}
        />
        {m.label}
      </span>
      {status === "failed" && message && <span className="truncate text-xs text-danger">{message}</span>}
    </span>
  );
}
