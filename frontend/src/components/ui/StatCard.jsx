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

export default function StatCard({
  label,
  value,
  hint,
  tone = "default",
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
      <span className={cn("text-2xl font-semibold tnum", TONES[tone])}>
        {value}
      </span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}
