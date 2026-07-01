import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "./cn";

// Centered dialog over a dimmed backdrop (takes most of the screen, not all).
// Same mount/animate-out pattern as SlideOver. Close on backdrop click or Escape.
// `height` lets a caller fix the dialog height (so it doesn't resize with its
// content); it defaults to growing up to 85vh.
export default function Modal({ open, onClose, title, subtitle, children, width = "max-w-2xl", height }) {
  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Double rAF so the start state paints before we animate (see SlideOver).
      let r2;
      const r1 = requestAnimationFrame(() => {
        r2 = requestAnimationFrame(() => setShow(true));
      });
      return () => {
        cancelAnimationFrame(r1);
        if (r2) cancelAnimationFrame(r2);
      };
    }
    setShow(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className={cn(
          "absolute inset-0 bg-black/50 transition-opacity duration-200",
          show ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
        onTransitionEnd={() => {
          if (!show) setMounted(false);
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative w-full bg-surface border border-border rounded-xl shadow-sm flex flex-col transition-all duration-200",
          width,
          height || "max-h-[85vh]",
          show ? "opacity-100 scale-100" : "opacity-0 scale-95"
        )}
      >
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
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
      </div>
    </div>,
    document.body
  );
}
