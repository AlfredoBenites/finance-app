import { cn } from "./cn";

// Surface container: white (or dark surface) with a subtle border, rounded.
// Borders do the visual separating here — shadows are reserved for overlays.
export default function Card({ className, padded = true, ...props }) {
  return (
    <div
      className={cn(
        "bg-surface border border-border rounded-lg",
        padded && "p-4",
        className
      )}
      {...props}
    />
  );
}
