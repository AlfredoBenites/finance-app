import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./cn";

// A section whose body collapses/expands under its header. The toggle chevron
// sits to the left of the header and only appears on hover (or keyboard focus).
//
// The body uses the CSS grid `0fr <-> 1fr` trick so the animation runs for the
// SAME fixed duration regardless of how tall the content is (a max-height
// animation would vary with content size). The inner wrapper needs
// `overflow-hidden` for the collapsed (0fr) state to actually hide the content;
// popovers that matter here (DateInput's calendar, native selects) render in a
// portal / popup layer, so they're not clipped by it.
//
// Easing starts gently and accelerates ("slow then quick") but still settles, so
// it reads as fast and smooth rather than abrupt.
const EASE = "ease-[cubic-bezier(0.45,0,0.2,1)]";

export default function CollapsibleSection({ title, defaultOpen = true, children, className }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={cn("mb-6", className)}>
      <div className="group flex items-center gap-1 mb-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Collapse section" : "Expand section"}
          className="grid place-items-center h-6 w-6 shrink-0 rounded text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ChevronDown size={16} className={cn("transition-transform duration-200", EASE, !open && "-rotate-90")} />
        </button>
        <div className="min-w-0">{title}</div>
      </div>

      <div className={cn("grid transition-[grid-template-rows] duration-200", EASE, open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">{children}</div>
      </div>
    </section>
  );
}
