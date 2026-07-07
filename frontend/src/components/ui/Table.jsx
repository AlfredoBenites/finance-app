import { cn } from "./cn";

// Lightweight table primitives styled to the system: muted header row, subtle
// row separators, comfortable padding. Use `align="right"` + className "tnum"
// on money cells. These are thin wrappers so pages keep full control of markup.
export function Table({ className, ...props }) {
  return (
    <div className="overflow-x-auto border border-border rounded-lg bg-surface">
      <table className={cn("w-full text-sm border-collapse", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }) {
  return (
    <thead
      className={cn("text-xs text-muted text-left", className)}
      {...props}
    />
  );
}

export function TH({ className, align = "left", ...props }) {
  return (
    <th
      className={cn(
        "font-medium px-4 py-2.5 border-b border-border",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className
      )}
      {...props}
    />
  );
}

export function TR({ className, ...props }) {
  return (
    <tr
      className={cn("border-b border-border last:border-0 hover:bg-surface-muted", className)}
      {...props}
    />
  );
}

export function TD({ className, align = "left", ...props }) {
  return (
    <td
      className={cn(
        "px-4 py-2.5 align-middle",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className
      )}
      {...props}
    />
  );
}
