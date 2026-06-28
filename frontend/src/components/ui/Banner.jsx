import { cn } from "./cn";

// Inline callout for notices (upcoming payments, info, warnings, errors).
// Left border + tinted background keeps it calm and on-brand.
const TONES = {
  info: "bg-info-bg border-info-border text-ink",
  success: "bg-green-bg border-green text-ink",
  warn: "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] border-accent text-ink",
  orange: "bg-orange-bg border-orange text-ink",
  danger: "bg-danger-bg border-danger text-ink",
};

export default function Banner({ tone = "info", className, children }) {
  return (
    <div
      className={cn(
        "border border-l-4 rounded-md px-3 py-2 text-sm",
        TONES[tone],
        className
      )}
    >
      {children}
    </div>
  );
}
