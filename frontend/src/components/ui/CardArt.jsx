import { cn } from "./cn";

// Generated credit-card visual (no external images). Uses the card's stored
// color as the base with a subtle diagonal sheen. Card name top-left, network
// top-right, last four bottom-right. Real-card aspect ratio (~1.586:1).
// `size`: "sm" for small list thumbnails, "lg" for the dashboard detail panel.
const SIZES = {
  sm: { pad: "p-4", name: "text-sm", net: "text-[11px]", num: "text-xs" },
  lg: { pad: "p-5", name: "text-xl", net: "text-base", num: "text-base" },
};

export default function CardArt({ name, network, lastFour, color, size = "sm", className }) {
  const s = SIZES[size] || SIZES.sm;
  return (
    <div
      className={cn(
        "relative w-full max-w-[20rem] aspect-[1.586/1] rounded-xl overflow-hidden text-white shadow-sm",
        className
      )}
      style={{ background: color || "#1f2933" }}
    >
      {/* sheen + depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-black/35" />
      <div className={cn("relative h-full flex flex-col justify-between", s.pad)}>
        <div className="flex items-center justify-between gap-2">
          <span className={cn("font-semibold leading-tight drop-shadow-sm truncate min-w-0", s.name)}>
            {name}
          </span>
          {network && (
            <span className={cn("font-bold uppercase tracking-wide text-white/90 shrink-0 leading-none", s.net)}>
              {network}
            </span>
          )}
        </div>
        <div className={cn("text-right tracking-widest text-white/90 tnum", s.num)}>
          ••••&nbsp;{lastFour || "••••"}
        </div>
      </div>
    </div>
  );
}
