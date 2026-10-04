type Props = {
  remainingMs: number;
  totalMs: number;
  /** The piece just lost to a penalty; flashes then fades. Change `cutKey` to replay. */
  cutMs?: number;
  cutKey?: number;
  className?: string;
};

/** A thin fuse under the input that drains with the clock. */
export function Fuse({ remainingMs, totalMs, cutMs = 0, cutKey = 0, className = "" }: Props) {
  const frac = Math.max(0, Math.min(1, remainingMs / totalMs));
  const cutFrac = Math.max(0, Math.min(1 - frac, cutMs / totalMs));
  const hot = remainingMs <= 5000;
  return (
    <div className={`relative h-[3px] w-full bg-[#0d1830] ${className}`} aria-hidden="true">
      <div
        className="absolute inset-y-0 left-0"
        style={{
          width: `${frac * 100}%`,
          background: hot ? "var(--accent)" : "var(--signal)",
          boxShadow: `0 0 8px ${hot ? "var(--accent)" : "var(--signal)"}`,
          transition: "width .12s linear",
        }}
      />
      {cutKey > 0 && cutFrac > 0 && (
        <div
          key={cutKey}
          className="absolute -inset-y-[2px]"
          style={{
            left: `${frac * 100}%`,
            width: `${cutFrac * 100}%`,
            background: "#fff",
            animation: "fuse-cut .7s ease-out forwards",
          }}
        />
      )}
      <style>{`@keyframes fuse-cut { 0% { opacity: 1; background: #fff } 40% { background: var(--accent) } 100% { opacity: 0; transform: translateY(6px) } }`}</style>
    </div>
  );
}
