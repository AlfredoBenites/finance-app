import { cn } from "./cn";

// Button with the design-system variants.
// - primary:   accent (yellow-green) fill with dark ink — the one key CTA per view
// - secondary: neutral surface with a subtle border
// - green:     green fill for positive/confirming actions (e.g. "Mark paid")
// - ghost:     transparent, for low-emphasis inline actions (Edit, Cancel)
// - danger:    destructive actions (Delete)
const VARIANTS = {
  primary:
    "bg-accent text-accent-ink border border-transparent hover:brightness-95 font-semibold",
  secondary:
    "bg-control text-ink border border-border-strong hover:bg-control-hover",
  green:
    "bg-green text-white border border-transparent hover:brightness-110 font-medium",
  ghost:
    "bg-transparent text-ink border border-transparent hover:bg-surface-muted",
  danger:
    "bg-control text-danger border border-border-strong hover:bg-danger-bg",
};

const SIZES = {
  sm: "text-[13px] px-2.5 py-1.5 rounded-md gap-1.5",
  md: "text-sm px-3.5 py-2 rounded-md gap-2",
};

export default function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap cursor-pointer transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas",
        "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    />
  );
}
