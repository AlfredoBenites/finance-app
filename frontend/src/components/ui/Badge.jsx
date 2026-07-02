import { cn } from "./cn";

// Small pill for statuses. Soft tinted backgrounds for clean status chips.
const TONES = {
  neutral: "bg-surface-muted text-muted border border-border",
  success: "bg-green-bg text-green border border-transparent",
  warn: "bg-[color-mix(in_srgb,var(--accent)_22%,transparent)] text-ink border border-transparent",
  orange: "bg-orange-bg text-orange border border-transparent",
  teal: "bg-teal-500/10 text-teal-700 border border-transparent dark:bg-teal-400/15 dark:text-teal-300",
  danger: "bg-danger-bg text-danger border border-transparent",
  info: "bg-info-bg text-info border border-transparent",
};

export default function Badge({ tone = "neutral", className, children }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap",
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
