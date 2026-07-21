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

// `size="sm"` is for rows that fit more cards across, where the figure has to
// give up some room to stay on one line.
const SIZES = {
  md: "text-2xl",
  sm: "text-lg",
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
        "bg-surface border rounded-lg p-4 flex flex-col gap-1",
        accent ? "border-accent" : "border-border",
        className
      )}
    >
      <span className="text-xs text-muted">{label}</span>
      <span className={cn("font-semibold tnum", SIZES[size], TONES[tone])}>
        {value}
      </span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}
