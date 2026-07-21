import { cn } from "./cn";

// Dashboard figure: small uppercase-ish label over a big tabular number.
// `accent` outlines the one or two headline figures so yellow stays an accent.
// `tone` colors the value (e.g. "danger" for debt, "green" for positive).
const TONES = {
  default: "text-ink",
  green: "text-green",
  danger: "text-danger",
  muted: "text-muted",
};

// `size="sm"` is for rows that fit more cards across, where both the figure and
// the padding have to give up room so a six-figure number stays on one line.
const SIZES = {
  md: { text: "text-2xl", pad: "p-4" },
  sm: { text: "text-lg", pad: "p-3" },
};

export default function StatCard({
  label,
  value,
  hint,
  tone = "default",
  size = "md",
  accent = false,
  className,
}) {
  return (
    <div
      className={cn(
        "bg-surface border rounded-lg flex flex-col gap-1",
        SIZES[size].pad,
        accent ? "border-accent" : "border-border",
        className
      )}
    >
      <span className="text-xs text-muted">{label}</span>
      <span className={cn("font-semibold tnum", SIZES[size].text, TONES[tone])}>
        {value}
      </span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}
