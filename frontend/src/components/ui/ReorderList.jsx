import { useEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "./cn";

// Drag-to-reorder list that works with both mouse and touch (uses Pointer
// Events + a window listener while dragging, so it doesn't depend on the native
// HTML5 drag API, which doesn't fire on touch). Small lists only.
// - items: array; onReorder(nextItems) fires as you drag
// - getId(item) -> stable id; renderLabel(item) -> node
export default function ReorderList({ items, onReorder, getId = (i) => i.id, renderLabel }) {
  const [dragId, setDragId] = useState(null);
  const ref = useRef(null);
  // Keep the latest items in a ref so the window move-handler reorders against
  // the current array without re-subscribing on every change.
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    if (dragId == null) return;

    function moveOver(clientY) {
      const els = ref.current?.querySelectorAll("[data-rid]");
      if (!els) return;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (clientY >= r.top && clientY <= r.bottom) {
          const overId = el.getAttribute("data-rid");
          if (overId === dragId) return;
          const arr = itemsRef.current;
          const ids = arr.map(getId);
          const from = ids.indexOf(dragId);
          const to = ids.indexOf(overId);
          if (from < 0 || to < 0) return;
          const next = [...arr];
          next.splice(to, 0, next.splice(from, 1)[0]);
          onReorder(next);
          return;
        }
      }
    }

    const onMove = (e) => moveOver(e.clientY);
    const onUp = () => setDragId(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragId, getId, onReorder]);

  return (
    <ul ref={ref} className="space-y-1.5">
      {items.map((it) => {
        const id = getId(it);
        return (
          <li
            key={id}
            data-rid={id}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md border bg-surface select-none",
              dragId === id ? "border-accent opacity-60" : "border-border"
            )}
          >
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                setDragId(id);
              }}
              aria-label="Drag to reorder"
              className="touch-none cursor-grab active:cursor-grabbing text-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
            >
              <GripVertical size={16} />
            </button>
            <span className="text-sm text-ink truncate">{renderLabel(it)}</span>
          </li>
        );
      })}
    </ul>
  );
}
