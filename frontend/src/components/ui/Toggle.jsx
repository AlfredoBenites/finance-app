import { cn } from "./cn";

// Pill switch: the track turns green when on. Optional label sits
// to the left. Use for boolean filters/settings (replaces the old ad-hoc button).
export default function Toggle({ on, onClick, label, className }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 cursor-pointer select-none",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas rounded-full",
        className
      )}
    >
      {label && <span className="text-sm text-ink">{label}</span>}
      <span
        className={cn(
          "relative inline-block h-5 w-9 rounded-full transition-colors",
          on ? "bg-green" : "bg-border-strong"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform",
            on && "translate-x-4"
          )}
        />
      </span>
    </button>
  );
}
