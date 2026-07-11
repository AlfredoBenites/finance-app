import { useEffect, useState } from "react";
import { holdingsApi } from "../../api/client";
import { todayLocal } from "../../format";
import { SlideOver, Button, Field, Input, Select, DateInput, Amount, Badge } from "../ui";

const KINDS = [
  ["stock", "Stock / ETF"],
  ["crypto", "Crypto"],
];

// Fractional shares + tiny crypto prices, so show up to 6 decimals (not cents).
const priceStr = (n) =>
  n == null ? "—" : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 6 })}`;

// Slide-over to edit or delete a single holding. The parent keeps `holding`
// non-null through the close animation.
export default function HoldingDetailPanel({ holding, accounts, categories, open, onClose, onChanged }) {
  const [form, setForm] = useState({ account_id: "", symbol: "", kind: "stock", category: "", shares: "", manual_price: "" });
  const [sell, setSell] = useState({ shares: "", price: "", total: "", traded_on: todayLocal() });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  useEffect(() => {
    if (!holding) return;
    setForm({
      account_id: holding.account_id,
      symbol: holding.symbol,
      kind: holding.kind,
      category: holding.category ?? "",
      shares: String(holding.shares),
      manual_price: holding.manual_price != null ? String(holding.manual_price) : "",
    });
    setSell({ shares: "", price: "", total: "", traded_on: todayLocal() });
    setConfirmDelete(false);
    setActionError(null);
  }, [holding?.id]);

  const setSellField = (key, value) => setSell((s) => ({ ...s, [key]: value }));

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  async function run(fn) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const effPrice = holding ? (holding.manual_price != null ? holding.manual_price : holding.last_price) : null;
  const value = holding && effPrice != null ? Number(holding.shares) * Number(effPrice) : null;

  const save = () =>
    run(async () => {
      if (!form.account_id || !form.symbol.trim() || form.shares === "") {
        throw new Error("Account, symbol, and shares are required.");
      }
      await holdingsApi.update(holding.id, {
        account_id: form.account_id,
        symbol: form.symbol.trim().toUpperCase(),
        kind: form.kind,
        category: form.category.trim() || null,
        shares: Number(form.shares),
        manual_price: form.manual_price === "" ? null : Number(form.manual_price),
      });
      await onChanged();
    });

  const remove = () =>
    run(async () => {
      await holdingsApi.remove(holding.id);
      await onChanged();
      onClose();
    });

  const doSell = () =>
    run(async () => {
      if (sell.shares === "" || (sell.price === "" && sell.total === "")) {
        throw new Error("Enter shares and a price or total.");
      }
      const res = await holdingsApi.sell({
        holding_id: holding.id,
        shares: Number(sell.shares),
        price: sell.price === "" ? null : Number(sell.price),
        amount: sell.total === "" ? null : Number(sell.total),
        traded_on: sell.traded_on || null,
      });
      await onChanged();
      if (res?.shares_left === 0) onClose();
      else setSell({ shares: "", price: "", total: "", traded_on: todayLocal() });
    });

  const activeAccounts = accounts.filter((a) => a.is_active !== false);
  const sellAccountName = accounts.find((a) => a.id === holding?.account_id)?.name ?? "its account";

  return (
    <SlideOver open={open} onClose={onClose} title={holding?.symbol || "Holding"} subtitle={holding?.category || undefined}>
      {/* Value summary */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <div className="text-xs text-muted">Value</div>
          <div className="text-2xl font-semibold text-ink">
            {value == null ? <span className="text-muted">—</span> : <Amount value={value} />}
          </div>
          <div className="text-xs text-muted mt-1">
            {Number(holding?.shares || 0)} shares · {holding?.manual_price != null ? "manual " : ""}price {priceStr(effPrice)}
          </div>
        </div>
        <Badge tone={holding?.kind === "crypto" ? "orange" : "info"}>
          {holding?.kind === "crypto" ? "Crypto" : "Stock / ETF"}
        </Badge>
      </div>

      {/* Edit form */}
      <div className="space-y-3">
        <Field label="Account">
          <Select value={form.account_id} onChange={(e) => set("account_id", e.target.value)}>
            <option value="">Account…</option>
            {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <div className="flex gap-2">
          <Field label="Symbol" className="flex-1">
            <Input value={form.symbol} onChange={(e) => set("symbol", e.target.value)} placeholder="AAPL, BTC" />
          </Field>
          <Field label="Type" className="w-40">
            <Select value={form.kind} onChange={(e) => set("kind", e.target.value)}>
              {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Category" hint="Groups holdings within an account (e.g. Roth IRA, Brokerage, Crypto).">
          <Input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="Roth IRA" list="holding-categories" />
          <datalist id="holding-categories">
            {categories.map((c) => <option key={c} value={c} />)}
          </datalist>
        </Field>
        <div className="flex gap-2">
          <Field label="Shares" className="flex-1">
            <Input type="number" step="any" value={form.shares} onChange={(e) => set("shares", e.target.value)} />
          </Field>
          <Field label="Manual price" className="flex-1" hint="Optional. Overrides the fetched price.">
            <Input type="number" step="any" value={form.manual_price} onChange={(e) => set("manual_price", e.target.value)} placeholder="auto" />
          </Field>
        </div>
        <div>
          <Button variant="primary" size="sm" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      {/* Sell shares */}
      <div className="mt-6 pt-5 border-t border-border">
        <div className="text-sm font-medium text-ink">Sell shares</div>
        <p className="text-xs text-muted mt-0.5 mb-2">
          You own {Number(holding?.shares || 0)}. Proceeds return to {sellAccountName} as cash.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Shares">
            <Input type="number" step="any" value={sell.shares} onChange={(e) => setSellField("shares", e.target.value)} />
          </Field>
          <Field label="Price per share">
            <Input type="number" step="any" value={sell.price} onChange={(e) => setSellField("price", e.target.value)} placeholder={effPrice != null ? String(effPrice) : "0.00"} />
          </Field>
          <Field label="Total received" hint="Optional. Overrides shares x price.">
            <Input type="number" step="0.01" value={sell.total} onChange={(e) => setSellField("total", e.target.value)} placeholder="auto" />
          </Field>
          <Field label="Date">
            <DateInput value={sell.traded_on} onChange={(v) => setSellField("traded_on", v)} />
          </Field>
        </div>
        <div className="mt-2">
          <Button variant="green" size="sm" onClick={doSell} disabled={busy}>Sell</Button>
        </div>
      </div>

      {/* Delete */}
      <div className="mt-6 pt-5 border-t border-border">
        {confirmDelete ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-ink">Delete this holding?</span>
            <Button variant="danger" size="sm" onClick={remove} disabled={busy}>Delete</Button>
            <Button variant="ghost" size="sm" onClick={() => { setConfirmDelete(false); setActionError(null); }} disabled={busy}>Cancel</Button>
          </div>
        ) : (
          <Button variant="danger" size="sm" onClick={() => { setActionError(null); setConfirmDelete(true); }} disabled={busy}>
            Delete holding
          </Button>
        )}
        {actionError && <p className="mt-2 text-sm text-danger">{actionError}</p>}
      </div>
    </SlideOver>
  );
}
