import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "./cn";

// Right-side detail panel that slides in over the page with a dimming backdrop.
// Stays mounted through the exit animation, then unmounts. Close on backdrop
// click or Escape.
export default function SlideOver({ open, onClose, title, subtitle, children, width = "w-full max-w-xl" }) {
  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Double rAF so the off-screen start state is painted before we flip to
      // the on-screen state — otherwise synchronous content can skip the
      // transition and the panel "pops" in instead of sliding.
      let r2;
      const r1 = requestAnimationFrame(() => {
        r2 = requestAnimationFrame(() => setShow(true));
      });
      return () => {
        cancelAnimationFrame(r1);
        if (r2) cancelAnimationFrame(r2);
      };
    }
    setShow(false); // play exit animation; unmount on backdrop transitionend
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60]">
      <div
        className={cn(
          "absolute inset-0 bg-black/40 transition-opacity duration-200",
          show ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
        onTransitionEnd={() => {
          if (!show) setMounted(false);
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        className={cn(
          "absolute right-0 top-0 h-full bg-surface border-l border-border shadow-sm flex flex-col transition-transform duration-200",
          width,
          show ? "translate-x-0" : "translate-x-full"
        )}
      >
        <header className="flex items-start justify-between gap-3 px-5 py-3 shrink-0 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink truncate">{title}</h2>
            {subtitle && <p className="text-xs text-muted truncate">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 grid place-items-center h-8 w-8 rounded-md text-muted hover:bg-surface-muted hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto scroll-thin p-5">{children}</div>
      </aside>
    </div>,
    document.body
  );
}
