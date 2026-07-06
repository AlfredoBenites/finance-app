import { useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { transactionGroupsApi } from "../../api/client";
import { Button, Field, Select, Input, AmountInput, Amount, DateInput, cn } from "../ui";
import { todayLocal } from "../../format";
import { computeShares } from "./groupSplit";

const pctToDec = (pct) => (pct === "" || pct == null ? 0 : Number(pct) / 100);
const decToPct = (dec) => (dec == null ? "" : String(Math.round(Number(dec) * 10000) / 100));

// One shared purchase split into each participant's share. Used inline in the
// Expenses add form (create) and in a modal to edit an existing group.
export default function GroupPurchaseForm({
  profiles,
  cards,
  categoryList,
  primaryId,
  groupId = null,
  initialData = null,
  onDone,
  onExitGroup,
  setError,
}) {
  const d = initialData;
  const [mode, setMode] = useState(d?.mode || "itemized");
  const [date, setDate] = useState(d?.transaction_date || todayLocal());
  const [merchant, setMerchant] = useState(d?.merchant || "");
  const [category, setCategory] = useState(d?.category || "");
  const [cardId, setCardId] = useState(d?.card_id || "");
  const [cashbackPct, setCashbackPct] = useState(decToPct(d?.cashback_rate));
  const [taxPct, setTaxPct] = useState(decToPct(d?.tax_rate));
  const [tip, setTip] = useState(d?.tip != null ? String(d.tip) : "");
  const [deliveryFee, setDeliveryFee] = useState(d?.delivery_fee != null ? String(d.delivery_fee) : "");
  const [serviceFee, setServiceFee] = useState(d?.service_fee != null ? String(d.service_fee) : "");
  const [subtotal, setSubtotal] = useState(d?.subtotal != null ? String(d.subtotal) : ""); // even mode
  const [participants, setParticipants] = useState(
    d?.participants?.map((p) => ({ profile_id: p.profile_id, subtotal: p.subtotal != null ? String(p.subtotal) : "" })) || [
      { profile_id: primaryId || "", subtotal: "" },
    ]
  );
  const [saving, setSaving] = useState(false);

  const profileName = (id) => profiles.find((p) => p.id === id)?.name ?? "—";
  const setP = (i, changes) => setParticipants((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...changes } : p)));
  const addP = () => setParticipants((ps) => [...ps, { profile_id: "", subtotal: "" }]);
  const removeP = (i) => setParticipants((ps) => ps.filter((_, idx) => idx !== i));

  const valid = participants.filter((p) => p.profile_id);
  const { shares, grand } = computeShares({
    mode, taxRate: pctToDec(taxPct), tip, deliveryFee, serviceFee, subtotal,
    participants: valid, payerId: primaryId,
  });
  const owedFor = (pid) => shares.find((s) => s.profile_id === pid)?.owed ?? 0;

  async function submit(e) {
    e.preventDefault();
    if (!cardId) return setError("Pick the card you paid with.");
    if (valid.length === 0) return setError("Add at least one participant.");
    const ids = valid.map((p) => p.profile_id);
    if (new Set(ids).size !== ids.length) return setError("Each participant can only appear once.");
    if (shares.some((s) => s.owed <= 0)) return setError("Every participant's share must be positive.");

    const payload = {
      mode,
      card_id: cardId,
      transaction_date: date,
      merchant: merchant.trim() || null,
      category: category || null,
      cashback_rate: cashbackPct !== "" ? pctToDec(cashbackPct) : null,
      tax_rate: pctToDec(taxPct),
      tip: Number(tip) || 0,
      delivery_fee: Number(deliveryFee) || 0,
      service_fee: Number(serviceFee) || 0,
      subtotal: mode === "even" ? Number(subtotal) || 0 : null,
      payer_profile_id: primaryId || null,
      participants: valid.map((p) => ({
        profile_id: p.profile_id,
        subtotal: mode === "even" ? null : Number(p.subtotal) || 0,
      })),
    };
    setSaving(true);
    try {
      if (groupId) await transactionGroupsApi.update(groupId, payload);
      else await transactionGroupsApi.create(payload);
      setError(null);
      onDone();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* Type switch back to a normal expense (add form only) */}
      {onExitGroup && (
        <Field label="Type" className="max-w-[12rem]">
          <Select value="group" onChange={(e) => e.target.value !== "group" && onExitGroup(e.target.value)}>
            <option value="purchase">Purchase</option>
            <option value="refund">Refund</option>
            <option value="group">Group purchase</option>
          </Select>
        </Field>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Field label="Date">
          <DateInput value={date} onChange={setDate} />
        </Field>
        <Field label="Merchant">
          <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="e.g. Dinner" />
        </Field>
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Category…</option>
            {categoryList.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Paid with (card)">
          <Select value={cardId} onChange={(e) => setCardId(e.target.value)}>
            <option value="">Card…</option>
            {cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Cashback %" hint="On the whole charge">
          <Input type="number" step="0.01" placeholder="0" value={cashbackPct} onChange={(e) => setCashbackPct(e.target.value)} />
        </Field>
        <Field label="Tax rate %">
          <Input type="number" step="0.001" placeholder="0" value={taxPct} onChange={(e) => setTaxPct(e.target.value)} />
        </Field>
        <Field label="Tip">
          <AmountInput value={tip} onChange={setTip} />
        </Field>
        <Field label="Delivery fee">
          <AmountInput value={deliveryFee} onChange={setDeliveryFee} />
        </Field>
        <Field label="Service fee">
          <AmountInput value={serviceFee} onChange={setServiceFee} />
        </Field>
      </div>

      {/* Split mode */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-muted">Split</span>
        <div className="inline-flex rounded-md border border-border-strong p-0.5">
          {[["itemized", "By each order"], ["even", "Evenly"]].map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setMode(val)}
              className={cn("px-3 h-8 rounded text-sm transition-colors", mode === val ? "bg-control text-ink font-medium" : "text-muted hover:text-ink")}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted">
          {mode === "itemized" ? "Tax per order; tip & fees split evenly." : "Whole bill split equally."}
        </span>
      </div>

      {mode === "even" && (
        <Field label="Order subtotal (before tax/tip/fees)" className="max-w-xs">
          <AmountInput value={subtotal} onChange={setSubtotal} />
        </Field>
      )}

      {/* Participants */}
      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-muted">People in this order</div>
        {participants.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <Select className="flex-1" value={p.profile_id} onChange={(e) => setP(i, { profile_id: e.target.value })}>
              <option value="">Profile…</option>
              {profiles.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}{pr.is_primary ? " (me)" : ""}</option>)}
            </Select>
            {mode === "itemized" && (
              <AmountInput className="w-32" value={p.subtotal} onChange={(v) => setP(i, { subtotal: v })} />
            )}
            {p.profile_id && (
              <span className="text-sm text-muted w-24 text-right shrink-0">
                owes <Amount value={owedFor(p.profile_id)} />
              </span>
            )}
            <button type="button" onClick={() => removeP(i)} title="Remove" className="text-muted hover:text-danger shrink-0">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <Button type="button" size="sm" variant="ghost" onClick={addP}>
          <Plus size={14} /> Add person
        </Button>
      </div>

      {/* Total */}
      <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
        <span className="text-muted">Charge total (shares add up to this)</span>
        <strong className="text-ink"><Amount value={grand} /></strong>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Saving…" : groupId ? "Save group" : "Add group purchase"}
        </Button>
      </div>
    </form>
  );
}
