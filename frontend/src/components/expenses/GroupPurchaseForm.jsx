import { useState } from "react";
import { Trash2, Plus, ArrowRight } from "lucide-react";
import { transactionGroupsApi } from "../../api/client";
import { Button, Field, Select, Input, AmountInput, Amount, DateInput, cn } from "../ui";
import { todayLocal } from "../../format";
import { computeSplit } from "./groupSplit";

const pctToDec = (pct) => (pct === "" || pct == null ? 0 : Number(pct) / 100);
const decToPct = (dec) => (dec == null ? "" : String(Math.round(Number(dec) * 10000) / 100));
const amt = (v) => (v != null ? String(v) : "");

// One shared purchase split into each participant's share. Each share can be
// charged to a different profile ("charged to"), so you can cover someone or have
// one person pay for another. Used inline in the Expenses add form (create) and in
// a modal to edit an existing group.
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
  const [tax, setTax] = useState(amt(d?.tax));
  const [tip, setTip] = useState(amt(d?.tip));
  const [deliveryFee, setDeliveryFee] = useState(amt(d?.delivery_fee));
  const [serviceFee, setServiceFee] = useState(amt(d?.service_fee));
  const [discount, setDiscount] = useState(amt(d?.discount));
  const [subtotal, setSubtotal] = useState(amt(d?.subtotal)); // even mode
  const [participants, setParticipants] = useState(
    d?.participants?.map((p) => ({
      profile_id: p.profile_id,
      subtotal: p.subtotal != null ? String(p.subtotal) : "",
      charged_to: p.charged_to || p.profile_id,
    })) || [{ profile_id: primaryId || "", subtotal: "", charged_to: primaryId || "" }]
  );
  const [saving, setSaving] = useState(false);

  const profileName = (id) => profiles.find((p) => p.id === id)?.name ?? "—";
  const setP = (i, changes) =>
    setParticipants((ps) =>
      ps.map((p, idx) => {
        if (idx !== i) return p;
        const next = { ...p, ...changes };
        // Default "charged to" to follow the person unless it was set to someone else.
        if (changes.profile_id !== undefined && (!p.charged_to || p.charged_to === p.profile_id)) {
          next.charged_to = changes.profile_id;
        }
        return next;
      })
    );
  const addP = () => setParticipants((ps) => [...ps, { profile_id: "", subtotal: "", charged_to: "" }]);
  const removeP = (i) => setParticipants((ps) => ps.filter((_, idx) => idx !== i));

  const valid = participants.filter((p) => p.profile_id);
  const { perPerson, charges, grand } = computeSplit({
    mode, tax, tip, deliveryFee, serviceFee, discount, subtotal, participants: valid, payerId: primaryId,
  });
  const owedFor = (i) => perPerson.find((pp) => pp.profile_id === valid[i]?.profile_id)?.owed ?? 0;

  async function submit(e) {
    e.preventDefault();
    if (!cardId) return setError("Pick the card you paid with.");
    if (valid.length === 0) return setError("Add at least one participant.");
    const ids = valid.map((p) => p.profile_id);
    if (new Set(ids).size !== ids.length) return setError("Each person can only appear once.");
    if (charges.some((c) => c.owed <= 0)) return setError("Every charge must be positive.");

    const payload = {
      mode,
      card_id: cardId,
      transaction_date: date,
      merchant: merchant.trim() || null,
      category: category || null,
      cashback_rate: cashbackPct !== "" ? pctToDec(cashbackPct) : null,
      tax: Number(tax) || 0,
      tip: Number(tip) || 0,
      delivery_fee: Number(deliveryFee) || 0,
      service_fee: Number(serviceFee) || 0,
      discount: Number(discount) || 0,
      subtotal: mode === "even" ? Number(subtotal) || 0 : null,
      payer_profile_id: primaryId || null,
      participants: valid.map((p) => ({
        profile_id: p.profile_id,
        subtotal: mode === "even" ? null : Number(p.subtotal) || 0,
        charged_to: p.charged_to || p.profile_id,
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
          <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="e.g. DoorDash" />
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
        <Field label="Tax"><AmountInput value={tax} onChange={setTax} /></Field>
        <Field label="Tip"><AmountInput value={tip} onChange={setTip} /></Field>
        <Field label="Delivery fee"><AmountInput value={deliveryFee} onChange={setDeliveryFee} /></Field>
        <Field label="Service fee"><AmountInput value={serviceFee} onChange={setServiceFee} /></Field>
        <Field label="Discount" hint="Amount off the total"><AmountInput value={discount} onChange={setDiscount} /></Field>
      </div>

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
          {mode === "itemized" ? "Tax & discount by order; tip & fees split evenly." : "Whole bill split equally."}
        </span>
      </div>

      {mode === "even" && (
        <Field label="Order subtotal (items only)" className="max-w-xs">
          <AmountInput value={subtotal} onChange={setSubtotal} />
        </Field>
      )}

      {/* Participants */}
      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-muted">People in this order</div>
        {participants.map((p, i) => {
          const idx = valid.indexOf(p);
          return (
            <div key={i} className="flex items-center gap-2 flex-wrap">
              <Select className="flex-1 min-w-[9rem]" value={p.profile_id} onChange={(e) => setP(i, { profile_id: e.target.value })}>
                <option value="">Whose order…</option>
                {profiles.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}{pr.is_primary ? " (me)" : ""}</option>)}
              </Select>
              {mode === "itemized" && (
                <AmountInput className="w-28" value={p.subtotal} onChange={(v) => setP(i, { subtotal: v })} />
              )}
              {p.profile_id && (
                <span className="inline-flex items-center gap-1 text-xs text-muted">
                  <ArrowRight size={13} /> charge to
                  <Select className="w-32" value={p.charged_to || p.profile_id} onChange={(e) => setP(i, { charged_to: e.target.value })}>
                    {profiles.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}{pr.is_primary ? " (me)" : ""}</option>)}
                  </Select>
                </span>
              )}
              {p.profile_id && idx >= 0 && (
                <span className="text-sm text-muted w-20 text-right shrink-0">
                  <Amount value={owedFor(idx)} />
                </span>
              )}
              <button type="button" onClick={() => removeP(i)} title="Remove" className="text-muted hover:text-danger shrink-0">
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
        <Button type="button" size="sm" variant="ghost" onClick={addP}>
          <Plus size={14} /> Add person
        </Button>
      </div>

      {/* Charges created (after "charged to") */}
      {charges.length > 0 && (
        <div className="rounded-lg border border-border p-3 space-y-1">
          <div className="text-xs font-medium uppercase tracking-wide text-muted mb-1">Charges created</div>
          {charges.map((c) => (
            <div key={c.profile_id} className="flex items-center justify-between text-sm">
              <span className="text-ink">
                {profileName(c.profile_id)}{c.profile_id === primaryId ? " (you — own charge)" : " owes you"}
              </span>
              <strong className="text-ink"><Amount value={c.owed} /></strong>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-border pt-1 mt-1 text-sm">
            <span className="text-muted">Charge total</span>
            <strong className="text-ink"><Amount value={grand} /></strong>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Saving…" : groupId ? "Save group" : "Add group purchase"}
        </Button>
      </div>
    </form>
  );
}
