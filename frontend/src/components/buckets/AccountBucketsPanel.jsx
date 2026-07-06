import { useEffect, useRef, useState } from "react";
import { Pencil, Ban, GripVertical, RotateCcw } from "lucide-react";
import { bucketsApi } from "../../api/client";
import { useSettings } from "../../settings/SettingsContext";
import { SlideOver, Button, Input, Select, Amount, cn } from "../ui";
import { BucketIcon, BUCKET_ICONS, BUCKET_COLORS } from "./bucketIcons";
import { KINDS } from "./kinds";

function IconPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1">
      {BUCKET_ICONS.map(([key, label, Icon]) => (
        <button
          key={key}
          type="button"
          title={label}
          aria-label={label}
          onClick={() => onChange(key)}
          className={cn(
            "grid place-items-center h-8 w-8 rounded-md border transition-colors",
            value === key ? "border-accent bg-surface-muted" : "border-border hover:bg-surface-muted"
          )}
        >
          <Icon size={16} className="text-ink" />
        </button>
      ))}
    </div>
  );
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

// Slide-over to add/edit/reorder the buckets inside one account. Edits are staged
// locally and only written to the server when "Confirm changes" is clicked, so
// several changes apply in one round trip instead of one-at-a-time.
export default function AccountBucketsPanel({ account, buckets, accounts, open, onClose, onChanged, onError }) {
  const { bucketOrder, setBucketOrder } = useSettings();
  const activeAccounts = accounts.filter((a) => a.is_active !== false);

  const [rows, setRows] = useState([]); // working copy: {key,id?,name,kind,icon,color,account_id,current_amount,credit_card_id,isNew?,isDeleted?}
  const [original, setOriginal] = useState({}); // id -> snapshot for diffing
  const [seedVersion, setSeedVersion] = useState(0);
  const [editingKey, setEditingKey] = useState(null);
  const [dragKey, setDragKey] = useState(null);
  const [saving, setSaving] = useState(false);
  // Add-a-bucket form (staged into rows on "Add").
  const [name, setName] = useState("");
  const [kind, setKind] = useState("set_aside");
  const [icon, setIcon] = useState(null);
  const [color, setColor] = useState(null);

  const newId = useRef(0);

  // Seed the working copy when the account opens (not on every reload, so
  // in-progress edits aren't clobbered). Bump seedVersion to force a reseed.
  useEffect(() => {
    if (!open || !account) return;
    setRows(
      buckets.map((b) => ({
        key: b.id,
        id: b.id,
        name: b.name,
        kind: b.kind || "set_aside",
        icon: b.icon || null,
        color: b.color || null,
        account_id: b.account_id,
        current_amount: b.current_amount,
        credit_card_id: b.credit_card_id,
      }))
    );
    setOriginal(
      Object.fromEntries(
        buckets.map((b) => [b.id, { name: b.name, kind: b.kind || "set_aside", icon: b.icon || null, color: b.color || null, account_id: b.account_id }])
      )
    );
    setEditingKey(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id, open, seedVersion]);

  // Pointer-based drag reorder (works with mouse + touch).
  const listRef = useRef(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  useEffect(() => {
    if (!dragKey) return;
    function moveOver(clientY) {
      const els = listRef.current?.querySelectorAll("[data-key]");
      if (!els) return;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (clientY >= r.top && clientY <= r.bottom) {
          const overKey = el.getAttribute("data-key");
          if (overKey === dragKey) return;
          const arr = rowsRef.current;
          const from = arr.findIndex((x) => x.key === dragKey);
          const to = arr.findIndex((x) => x.key === overKey);
          if (from < 0 || to < 0) return;
          const next = [...arr];
          next.splice(to, 0, next.splice(from, 1)[0]);
          setRows(next);
          return;
        }
      }
    }
    const onMove = (e) => moveOver(e.clientY);
    const onUp = () => setDragKey(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragKey]);

  const setRow = (key, changes) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...changes } : r)));
  const removeRow = (key) => setRows((rs) => rs.filter((r) => r.key !== key));
  const toggleDelete = (r) => {
    if (r.isNew) removeRow(r.key);
    else setRow(r.key, { isDeleted: !r.isDeleted });
  };

  function stageAdd(e) {
    e.preventDefault();
    if (!name.trim()) return;
    const key = `new-${newId.current++}`;
    setRows((rs) => [...rs, { key, name: name.trim(), kind, icon, color, account_id: account.id, current_amount: 0, isNew: true }]);
    setName("");
    setKind("set_aside");
    setIcon(null);
    setColor(null);
  }

  // Is there anything to save?
  const origIds = buckets.map((b) => b.id);
  const curIds = rows.filter((r) => r.id && !r.isDeleted).map((r) => r.id);
  const orderChanged = curIds.length === origIds.length && curIds.some((id, i) => id !== origIds[i]);
  const dirty =
    orderChanged ||
    rows.some((r) => (r.isNew && !r.isDeleted) || (r.id && r.isDeleted)) ||
    rows.some((r) => {
      if (!r.id || r.isDeleted) return false;
      const o = original[r.id];
      return (
        o &&
        (r.name.trim() !== o.name ||
          r.kind !== o.kind ||
          (r.icon || null) !== (o.icon || null) ||
          (r.color || null) !== (o.color || null) ||
          r.account_id !== o.account_id)
      );
    });

  async function confirm() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      for (const r of rows) {
        if (r.isNew && !r.isDeleted) {
          await bucketsApi.create({ name: r.name.trim(), account_id: account.id, current_amount: 0, kind: r.kind, icon: r.icon, color: r.color });
        }
      }
      for (const r of rows) {
        if (!r.id) continue;
        if (r.isDeleted) {
          await bucketsApi.remove(r.id);
          continue;
        }
        const o = original[r.id] || {};
        const changes = {};
        if (r.name.trim() !== o.name) changes.name = r.name.trim();
        if (r.kind !== o.kind) changes.kind = r.kind;
        if ((r.icon || null) !== (o.icon || null)) changes.icon = r.icon;
        if ((r.color || null) !== (o.color || null)) changes.color = r.color;
        if (r.account_id !== o.account_id) changes.account_id = r.account_id;
        if (Object.keys(changes).length) await bucketsApi.update(r.id, changes);
      }
      // Persist the new bucket order for this account (existing, non-deleted).
      setBucketOrder({ ...bucketOrder, [account.id]: rows.filter((r) => r.id && !r.isDeleted).map((r) => r.id) });
      await onChanged();
      setSeedVersion((v) => v + 1);
    } catch (e) {
      onError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const cancel = () => setSeedVersion((v) => v + 1); // discard staged edits

  return (
    <SlideOver open={open} onClose={onClose} title={account ? account.name : "Account"} subtitle="Add, edit, and reorder buckets">
      {account && (
        <div className="space-y-6">
          {/* Add a bucket (account already known) */}
          <form onSubmit={stageAdd} className="space-y-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted">Add a bucket</div>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bucket name" />
            <Select value={kind} onChange={(e) => setKind(e.target.value)} title={KINDS.find((k) => k.value === kind)?.hint}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </Select>
            <div>
              <div className="text-xs text-muted mb-1">Icon</div>
              <IconPicker value={icon} onChange={setIcon} />
            </div>
            <div>
              <div className="text-xs text-muted mb-1">Color</div>
              <ColorPicker value={color} onChange={setColor} />
            </div>
            <Button type="submit" variant="secondary">Add to list</Button>
          </form>

          {/* Buckets (drag the grip to reorder; pencil to edit) */}
          <div className="border-t border-border pt-5 space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted">Buckets</div>
            {rows.length === 0 ? (
              <p className="text-sm text-muted">No buckets in this account yet.</p>
            ) : (
              <div ref={listRef} className="space-y-2">
                {rows.map((r) => (
                  <div key={r.key} data-key={r.key} className={cn("rounded-lg border", dragKey === r.key ? "border-accent opacity-60" : "border-border")}>
                    <div className="flex items-center gap-2 px-2 py-2">
                      <button
                        type="button"
                        onPointerDown={(e) => { e.preventDefault(); setDragKey(r.key); }}
                        aria-label="Drag to reorder"
                        className="touch-none cursor-grab active:cursor-grabbing text-muted hover:text-ink"
                      >
                        <GripVertical size={16} />
                      </button>
                      <BucketIcon icon={r.icon || (r.credit_card_id ? "credit-card" : undefined)} color={r.color} />
                      <span className={cn("text-sm truncate flex-1", r.isDeleted ? "text-muted line-through" : "text-ink")}>
                        {r.name}{r.isNew ? " (new)" : ""}
                      </span>
                      <span className="text-sm text-muted"><Amount value={r.current_amount} /></span>
                      {r.isDeleted ? (
                        <button onClick={() => toggleDelete(r)} title="Undo delete" className="text-muted hover:text-ink"><RotateCcw size={15} /></button>
                      ) : (
                        <button
                          onClick={() => setEditingKey(editingKey === r.key ? null : r.key)}
                          title="Edit"
                          className="text-muted hover:text-ink"
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                    </div>

                    {editingKey === r.key && !r.isDeleted && (
                      <div className="border-t border-border px-3 py-3 space-y-3">
                        <Input value={r.name} onChange={(e) => setRow(r.key, { name: e.target.value })} placeholder="Bucket name" />
                        {!r.credit_card_id && (
                          <Select value={r.kind} onChange={(e) => setRow(r.key, { kind: e.target.value })} title={KINDS.find((k) => k.value === r.kind)?.hint}>
                            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                          </Select>
                        )}
                        <div>
                          <div className="text-xs text-muted mb-1">Icon</div>
                          <IconPicker value={r.icon} onChange={(v) => setRow(r.key, { icon: v })} />
                        </div>
                        <div>
                          <div className="text-xs text-muted mb-1">Color</div>
                          <ColorPicker value={r.color} onChange={(v) => setRow(r.key, { color: v })} />
                        </div>
                        <div className="flex items-center gap-2">
                          <Select value={r.account_id || account.id} title="Move to account" onChange={(e) => setRow(r.key, { account_id: e.target.value })}>
                            {activeAccounts.concat(account.is_active === false ? [account] : []).map((acc) => (
                              <option key={acc.id} value={acc.id}>{acc.name}</option>
                            ))}
                          </Select>
                          <Button size="sm" variant="danger" className="ml-auto" onClick={() => toggleDelete(r)}>Delete</Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Confirm / Cancel */}
          <div className="flex items-center gap-2 border-t border-border pt-4">
            <Button variant="primary" onClick={confirm} disabled={!dirty || saving}>
              {saving ? "Saving…" : "Confirm changes"}
            </Button>
            <Button variant="ghost" onClick={cancel} disabled={!dirty || saving}>Cancel</Button>
            {dirty && !saving && <span className="text-xs text-muted ml-auto">Unsaved changes</span>}
          </div>
        </div>
      )}
    </SlideOver>
  );
}
