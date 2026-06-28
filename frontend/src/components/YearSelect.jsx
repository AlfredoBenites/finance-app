import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./ui";

// Year filter used on Dashboard, Expenses, and Income.
// value is a year string (e.g. "2026") or "all". Defaults to the current year.
// Custom dropdown (not a native <select>) so the value and chevron sit together
// tightly instead of the chevron floating far to the right.
const NOW = new Date().getFullYear();
export const CURRENT_YEAR = String(NOW);
export const YEARS = [NOW, NOW - 1, NOW - 2];

const OPTIONS = [...YEARS.map((y) => [String(y), String(y)]), ["all", "All time"]];

export default function YearSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = OPTIONS.find(([v]) => v === value)?.[1] ?? value;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 bg-surface text-ink border border-border rounded-md pl-3 pr-2 py-2 text-sm cursor-pointer hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span>{label}</span>
        <ChevronDown size={16} className={cn("text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="absolute right-0 z-20 mt-1 min-w-[8rem] bg-surface border border-border rounded-md shadow-sm py-1">
          {OPTIONS.map(([v, l]) => (
            <li key={v}>
              <button
                type="button"
                onClick={() => {
                  onChange(v);
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-sm hover:bg-surface-muted",
                  v === value ? "text-ink font-medium" : "text-muted"
                )}
              >
                {l}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
