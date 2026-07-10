import { useEffect, useRef, useState } from "react";
import { GripVertical, Ban } from "lucide-react";
import { accountsApi } from "../../api/client";
import { useSettings } from "../../settings/SettingsContext";
import { SlideOver, Button, Input, Select, cn } from "../ui";
import { BucketIcon, BUCKET_COLORS } from "../buckets/bucketIcons";
import { ACCOUNT_TYPES, typeLabel } from "./accountTypes";

// Order an array of {id} by a saved list of ids; anything not listed goes last.
function applyOrder(items, order) {
  const set = new Set(order || []);
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  const inOrder = (order || []).map((id) => byId[id]).filter(Boolean);
  const rest = items.filter((i) => !set.has(i.id));
  return [...inOrder, ...rest];
}

function ColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        title="No color"
        aria-label="No color"
        onClick={() => onChange(null)}
        className={cn("grid place-items-center h-6 w-6 rounded-full border-2", !value ? "border-ink" : "border-border")}
      >
        <Ban size={12} className="text-muted" />
      </button>
      {BUCKET_COLORS.map(([key, label, hex]) => (
        <button
          key={key}
          type="button"
          title={label}
          aria-label={label}
          onClick={() => onChange(key)}
          className={cn("h-6 w-6 rounded-full border-2 transition-transform", value === key ? "border-ink scale-110" : "border-transparent")}
          style={{ backgroundColor: hex }}
        />
      ))}
    </div>
  );
}

// Slide-over to add an account, reorder accounts (drag the grip), and set each
// account's icon color. Order + colors are device preferences that apply
// instantly; adding an account writes to the server.
export default function AccountsManagerPanel({ accounts, open, onClose, onChanged, onError }) {
  const { accountOrder, setAccountOrder, accountIconColors, setAccountIconColors } = useSettings();

  const [name, setName] = useState("");
  const [type, setType] = useState(ACCOUNT_TYPES[0]);
  const [balance, setBalance] = useState("");
  const [isAsset, setIsAsset] = useState(true);
  const [adding, setAdding] = useState(false);
  const [dragId, setDragId] = useState(null);

  const activeAccounts = accounts.filter((a) => a.is_active !== false);
  const ordered = applyOrder(activeAccounts, accountOrder);

  // Keep the current order in a ref so the drag handler reorders against the
  // latest array without re-subscribing on every render.
  const orderedRef = useRef(ordered);
  orderedRef.current = ordered;
  const listRef = useRef(null);

  useEffect(() => {
    if (dragId == null) return;
    function moveOver(clientY) {
      const els = listRef.current?.querySelectorAll("[data-rid]");
      if (!els) return;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (clientY >= r.top && clientY <= r.bottom) {
          const overId = el.getAttribute("data-rid");
          if (overId === dragId) return;
          const ids = orderedRef.current.map((a) => a.id);
          const from = ids.indexOf(dragId);
          const to = ids.indexOf(overId);
          if (from < 0 || to < 0) return;
          const next = [...ids];
          next.splice(to, 0, next.splice(from, 1)[0]);
          setAccountOrder(next);
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
  }, [dragId, setAccountOrder]);

  async function add(e) {
    e.preventDefault();
    if (!name.trim() || adding) return;
    setAdding(true);
    try {
      await accountsApi.create({
        name: name.trim(),
        account_type: type,
        balance: balance === "" ? 0 : Number(balance),
        is_asset: isAsset,
      });
      setName("");
      setBalance("");
      setType(ACCOUNT_TYPES[0]);
      setIsAsset(true);
      onError?.(null);
      await onChanged();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setAdding(false);
    }
  }

  const setColor = (id, color) => setAccountIconColors({ ...accountIconColors, [id]: color });

  return (
    <SlideOver open={open} onClose={onClose} title="Your accounts" subtitle="Add, reorder, and color your accounts">
      <div className="space-y-6">
        {/* Add an account */}
        <form onSubmit={add} className="space-y-3">
          <div className="text-xs font-medium uppercase tracking-wide text-muted">Add an account</div>
          <div className="flex gap-2">
            <Input className="flex-1 min-w-0" value={name} onChange={(e) => setName(e.target.value)} placeholder="Account name" />
            <Select className="w-32 shrink-0" value={type} onChange={(e) => setType(e.target.value)}>
              {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
            </Select>
            <Input type="number" step="0.01" className="w-24 shrink-0" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="Balance" />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="h-4 w-4 accent-green" checked={isAsset} onChange={(e) => setIsAsset(e.target.checked)} />
            Counts as an asset
          </label>
          <p className="text-xs text-muted">Uncheck only for a debt you track as an account, like a car loan or mortgage.</p>
          <Button type="submit" variant="secondary" disabled={adding}>{adding ? "Adding…" : "Add account"}</Button>
        </form>

        {/* Reorder + colors */}
        <div className="border-t border-border pt-5 space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-muted">Order &amp; color</div>
          {ordered.length === 0 ? (
            <p className="text-sm text-muted">No accounts yet.</p>
          ) : (
            <div ref={listRef} className="space-y-2">
              {ordered.map((a) => (
                <div
                  key={a.id}
                  data-rid={a.id}
                  className={cn("rounded-lg border px-2 py-2 bg-surface select-none", dragId === a.id ? "border-accent opacity-60" : "border-border")}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onPointerDown={(e) => { e.preventDefault(); setDragId(a.id); }}
                      aria-label="Drag to reorder"
                      className="touch-none cursor-grab active:cursor-grabbing text-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                    >
                      <GripVertical size={16} />
                    </button>
                    <BucketIcon icon="landmark" color={accountIconColors[a.id]} />
                    <span className="text-sm text-ink truncate flex-1">{a.name}</span>
                  </div>
                  <div className="mt-2 pl-8">
                    <ColorPicker value={accountIconColors[a.id]} onChange={(v) => setColor(a.id, v)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </SlideOver>
  );
}
