import { useState } from "react";
import { Pencil, Ban } from "lucide-react";
import { bucketsApi } from "../../api/client";
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
        className={cn(
          "grid place-items-center h-6 w-6 rounded-full border-2",
          !value ? "border-ink" : "border-border"
        )}
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
          className={cn(
            "h-6 w-6 rounded-full border-2 transition-transform",
            value === key ? "border-ink scale-110" : "border-transparent"
          )}
          style={{ backgroundColor: hex }}
        />
      ))}
    </div>
  );
}

// Slide-over to add and edit the buckets inside one account. Opened by clicking an
// account name on the Buckets page, so the account is known — no account picker.
export default function AccountBucketsPanel({ account, buckets, accounts, open, onClose, onChanged, onError }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("set_aside");
  const [icon, setIcon] = useState(null);
  const [color, setColor] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  const activeAccounts = accounts.filter((a) => a.is_active !== false);

  async function run(promise) {
    try {
      await promise;
      onChanged();
    } catch (e) {
      onError(e.message);
    }
  }
  const update = (id, changes) => run(bucketsApi.update(id, changes));
  const del = (id) => run(bucketsApi.remove(id));

  async function addBucket(e) {
    e.preventDefault();
    if (!account || !name.trim()) return;
    try {
      await bucketsApi.create({ name: name.trim(), account_id: account.id, current_amount: 0, kind, icon, color });
      setName("");
      setKind("set_aside");
      setIcon(null);
      setColor(null);
      onChanged();
    } catch (e) {
      onError(e.message);
    }
  }

  return (
    <SlideOver open={open} onClose={onClose} title={account ? account.name : "Account"} subtitle="Add and edit buckets">
      {account && (
        <div className="space-y-6">
          {/* Add a bucket (account is already known) */}
          <form onSubmit={addBucket} className="space-y-3">
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
            <Button type="submit" variant="primary">Add bucket</Button>
          </form>

          {/* Existing buckets */}
          <div className="border-t border-border pt-5 space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted">Buckets</div>
            {buckets.length === 0 ? (
              <p className="text-sm text-muted">No buckets in this account yet.</p>
            ) : (
              buckets.map((b) => (
                <div key={b.id} className="rounded-lg border border-border">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <BucketIcon icon={b.icon || (b.credit_card_id ? "credit-card" : undefined)} color={b.color} />
                    <span className="text-sm text-ink truncate flex-1">{b.name}</span>
                    <span className="text-sm text-muted"><Amount value={b.current_amount} /></span>
                    <button
                      onClick={() => (editingId === b.id ? setEditingId(null) : (setEditingId(b.id), setEditName(b.name)))}
                      title="Edit"
                      aria-label="Edit bucket"
                      className="text-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                    >
                      <Pencil size={15} />
                    </button>
                  </div>

                  {editingId === b.id && (
                    <div className="border-t border-border px-3 py-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1" />
                        <Button size="sm" onClick={() => update(b.id, { name: editName.trim() })}>Rename</Button>
                      </div>
                      {!b.credit_card_id && (
                        <Select
                          value={b.kind || "set_aside"}
                          title={KINDS.find((k) => k.value === (b.kind || "set_aside"))?.hint}
                          onChange={(e) => update(b.id, { kind: e.target.value })}
                        >
                          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                        </Select>
                      )}
                      <div>
                        <div className="text-xs text-muted mb-1">Icon</div>
                        <IconPicker value={b.icon} onChange={(v) => update(b.id, { icon: v })} />
                      </div>
                      <div>
                        <div className="text-xs text-muted mb-1">Color</div>
                        <ColorPicker value={b.color} onChange={(v) => update(b.id, { color: v })} />
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={account.id}
                          title="Move to account"
                          onChange={(e) => update(b.id, { account_id: e.target.value })}
                        >
                          {activeAccounts.concat(account.is_active === false ? [account] : []).map((acc) => (
                            <option key={acc.id} value={acc.id}>{acc.name}</option>
                          ))}
                        </Select>
                        <Button size="sm" variant="danger" className="ml-auto" onClick={() => del(b.id)}>Delete</Button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </SlideOver>
  );
}
