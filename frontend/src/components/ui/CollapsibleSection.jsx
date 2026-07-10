import { useState } from "react";
import { ChevronDown } from "lucide-react";
import usePersistedState from "../../hooks/usePersistedState";
import { cn } from "./cn";

// A section whose body collapses/expands when you click its header. The header
// text is the toggle (flush left, hover underline hints it's clickable) with a
// small chevron after it that rotates to show the current state: pointing down
// when open, right when collapsed. When collapsed you can also show a muted
// `summary` (e.g. a count) so it's clear there's hidden content, not nothing.
//
// Pass `actions` for controls that sit after the header and should NOT toggle
// (e.g. an edit pencil); they reveal on header hover via `group`.
//
// The body uses the CSS grid `0fr <-> 1fr` trick so the animation runs for the
// SAME fixed duration regardless of content height. The inner wrapper needs
// `overflow-hidden` for the collapsed (0fr) state to actually hide the content;
// popovers that matter here (DateInput's calendar, native selects) render in a
// portal / popup layer, so they're not clipped by it.
//
// Pass `storageKey` to remember the open/closed choice across reloads.
const EASE = "ease-[cubic-bezier(0.45,0,0.2,1)]";

export default function CollapsibleSection({ title, summary, actions, storageKey, defaultOpen = true, children, className }) {
  // Persist only when a key is given; otherwise keep it in local state. Both
  // hooks run every render (hook rules), we just pick which one drives the UI.
  const localState = useState(defaultOpen);
  const persistedState = usePersistedState(`ui.collapse.${storageKey || "_scratch"}`, defaultOpen);
  const [open, setOpen] = storageKey ? persistedState : localState;

  return (
    <section className={cn("mb-6", className)}>
      <div className="group flex items-center gap-1.5 mb-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 text-lg font-semibold text-ink text-left rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span className="underline-offset-4 decoration-accent group-hover:underline">{title}</span>
          <ChevronDown size={18} className={cn("text-muted transition-transform duration-200", EASE, !open && "-rotate-90")} />
        </button>
        {!open && summary != null && summary !== "" && (
          <span className="text-sm text-muted">{summary}</span>
        )}
        {actions}
      </div>

      <div className={cn("grid transition-[grid-template-rows] duration-200", EASE, open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">{children}</div>
      </div>
    </section>
  );
}
