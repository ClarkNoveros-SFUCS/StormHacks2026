import Link from "next/link";

type Props = { size?: "sm" | "md" | "lg"; href?: string; className?: string };

const SIZE = {
  sm: "text-xl [--sh:2px]",
  md: "text-4xl [--sh:3px]",
  lg: "text-[clamp(48px,10vw,104px)] [--sh:4px]",
};

/** SYLLABYSS wordmark: pixel type with a chromatic (accent / signal) shadow and a slow flicker. */
export function Logo({ size = "md", href, className = "" }: Props) {
  const word = (
    <span
      className={`font-display font-bold tracking-[0.04em] text-text ${SIZE[size]} ${className}`}
      style={{
        textShadow: "var(--sh) 0 var(--accent), calc(var(--sh) * -1) 0 var(--signal)",
        animation: "title-flicker 8s infinite",
      }}
    >
      SYLLABYSS
    </span>
  );
  if (!href) return word;
  return (
    <Link href={href} aria-label="SYLLABYSS home" className="rounded-sm">
      {word}
    </Link>
  );
}
