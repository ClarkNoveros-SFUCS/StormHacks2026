import { PixelIcon, type PixelIconName } from "@/components/ui";

// The ocean Rank (Plankton → Leviathan, decisions Q11) as a small pixel shield whose colour
// climbs with the Rank.

const RANK_STYLE: Record<string, { icon: PixelIconName; color: string }> = {
  Plankton: { icon: "sprout", color: "#3ddc97" },
  Shrimp: { icon: "shell", color: "#ff9f43" },
  "Reef Fish": { icon: "fish", color: "#4de3ff" },
  Dolphin: { icon: "bubble", color: "#5aa8ff" },
  Orca: { icon: "jelly", color: "#9d7bff" },
  Leviathan: { icon: "crown", color: "#ffd84d" },
};

export function rankStyle(rank: string) {
  return RANK_STYLE[rank] ?? RANK_STYLE.Plankton;
}

export function RankEmblem({ rank, size = 36 }: { rank: string; size?: number }) {
  const st = rankStyle(rank);
  return (
    <span
      role="img"
      aria-label={`${rank} rank`}
      className="grid shrink-0 place-items-center"
      style={{
        width: size,
        height: size * 1.1,
        clipPath: "polygon(0 0, 100% 0, 100% 62%, 75% 86%, 50% 100%, 25% 86%, 0 62%)",
        background: `linear-gradient(180deg, color-mix(in srgb, ${st.color} 55%, #0a0d1c), color-mix(in srgb, ${st.color} 20%, #0a0d1c))`,
        boxShadow: `inset 0 0 0 2px ${st.color}`,
      }}
    >
      <span className="-mt-1">
        <PixelIcon name={st.icon} size={size * 0.55} />
      </span>
    </span>
  );
}
