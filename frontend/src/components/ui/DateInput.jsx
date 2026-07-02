import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDate } from "../../format";
import { cn } from "./cn";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function iso(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Parse a date typed in a few friendly formats into an ISO string, or null.
function parseLooseDate(s) {
  s = s.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return iso(y, +m[1], +m[2]);
  }
  m = s.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const mo = MONTHS.findIndex((x) => x.toLowerCase() === m[1].slice(0, 3).toLowerCase());
    if (mo >= 0) return iso(+m[3], mo + 1, +m[2]);
  }
  return null;
}

// Date field you can type into freely (e.g. "Jul 8, 2026", "7/8/2026",
// "2026-07-08") with a styled calendar popover. value/onChange use ISO
// "YYYY-MM-DD". Fully themed, so it works in dark mode (unlike the native input).
export default function DateInput({ value, onChange, className }) {
  const [text, setText] = useState(value ? formatDate(value) : "");
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => value || todayIso());
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    setText(value ? formatDate(value) : "");
    if (value) setView(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function commitText() {
    const parsed = parseLooseDate(text);
    if (parsed) {
      onChange(parsed);
      setText(formatDate(parsed));
    } else {
      setText(value ? formatDate(value) : "");
    }
  }

  function openCalendar() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 260) });
    }
    setView(value || todayIso());
    setOpen((o) => !o);
  }

  const [vy, vm] = view.split("-").map(Number); // view year/month
  const firstWeekday = new Date(vy, vm - 1, 1).getDay();
  const daysInMonth = new Date(vy, vm, 0).getDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const shiftMonth = (delta) => {
    const d = new Date(vy, vm - 1 + delta, 1);
    setView(iso(d.getFullYear(), d.getMonth() + 1, 1));
  };

  return (
    <div ref={wrapRef} className={cn("relative flex", className)}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), commitText())}
        placeholder="Mon D, YYYY"
        className="bg-surface text-ink border border-border rounded-l-md px-3 py-2 text-sm w-full placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
      />
      <button
        ref={btnRef}
        type="button"
        onClick={openCalendar}
        aria-label="Open calendar"
        className="grid place-items-center px-2 border border-l-0 border-border rounded-r-md text-muted hover:text-ink hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Calendar size={16} />
      </button>

      {open &&
        createPortal(
          <div
            className="fixed z-[80] w-60 bg-surface border border-border rounded-lg shadow-sm p-2"
            style={{ top: pos.top, left: pos.left }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={() => shiftMonth(-1)} className="p-1 rounded text-muted hover:text-ink hover:bg-surface-muted">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-medium text-ink">{MONTHS[vm - 1]} {vy}</span>
              <button type="button" onClick={() => shiftMonth(1)} className="p-1 rounded text-muted hover:text-ink hover:bg-surface-muted">
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {WEEKDAYS.map((w, i) => (
                <span key={i} className="text-[10px] text-muted py-1">{w}</span>
              ))}
              {cells.map((d, i) => {
                if (d === null) return <span key={i} />;
                const cellIso = iso(vy, vm, d);
                const selected = cellIso === value;
                const isToday = cellIso === todayIso();
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      onChange(cellIso);
                      setOpen(false);
                    }}
                    className={cn(
                      "h-7 w-7 mx-auto grid place-items-center rounded-full text-xs transition-colors",
                      selected
                        ? "bg-accent text-accent-ink font-semibold"
                        : isToday
                        ? "text-ink font-semibold ring-1 ring-border-strong"
                        : "text-ink hover:bg-surface-muted"
                    )}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function todayIso() {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
