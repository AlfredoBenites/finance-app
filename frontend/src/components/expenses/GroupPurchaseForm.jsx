import { useState } from "react";
import { Trash2, Plus, Info } from "lucide-react";
import { transactionGroupsApi } from "../../api/client";
import { Button, Field, Select, Input, AmountInput, Amount, DateInput, Table, THead, TH, TR, TD, cn } from "../ui";
import { todayLocal, money } from "../../format";
import { computeSplit } from "./groupSplit";

const pctToDec = (pct) => (pct === "" || pct == null ? 0 : Number(pct) / 100);
const decToPct = (dec) => (dec == null ? "" : String(Math.round(Number(dec) * 10000) / 100));
const amt = (v) => (v != null ? String(v) : "");

// One shared purchase split into each participant's share; each share can be
// charged to a different profile. Used inline in the Expenses add form (create,
// with `carry` from the normal form) and in a modal to edit (`initialData`).
export default function GroupPurchaseForm({
  profiles,
  cards,
  accounts,
  rules,
  categoryList,
  primaryId,
  groupId = null,
  initialData = null,
  carry = null,
  onDone,
  onExitGroup,
  setError,
}) {
  const d = initialData;
  const c = carry || {};
  const initSource = d
    ? d.card_id ? `card:${d.card_id}` : d.account_id ? `account:${d.account_id}` : ""
    : c.paymentSource || "";

  const [mode, setMode] = useState(d?.mode || "itemized");
  const [date, setDate] = useState(d?.transaction_date || c.transaction_date || todayLocal());
  const [merchant, setMerchant] = useState(d?.merchant ?? c.merchant ?? "");
  const [category, setCategory] = useState(d?.category ?? c.category ?? "");
  const [paymentSource, setPaymentSource] = useState(initSource);
  const [cashbackPct, setCashbackPct] = useState(d ? decToPct(d.cashback_rate) : c.cashbackPct ?? "");
  const [amount, setAmount] = useState(d?.amount != null ? String(d.amount) : d?.subtotal != null ? String(d.subtotal) : "");
  const [tax, setTax] = useState(amt(d?.tax));
  const [tip, setTip] = useState(amt(d?.tip));
  const [deliveryFee, setDeliveryFee] = useState(amt(d?.delivery_fee));
  const [serviceFee, setServiceFee] = useState(amt(d?.service_fee));
  const [discount, setDiscount] = useState(amt(d?.discount));
  const [notes, setNotes] = useState(d?.notes ?? "");
  const [participants, setParticipants] = useState(
    d?.participants?.map((p) => ({
      profile_id: p.profile_id,
      subtotal: p.subtotal != null ? String(p.subtotal) : "",
      charged_to: p.charged_to || p.profile_id,
    })) || [{ profile_id: primaryId || "", subtotal: "", charged_to: primaryId || "" }]
  );
  const [saving, setSaving] = useState(false);

  const isCard = paymentSource.startsWith("card:");
  const itemized = mode === "itemized";

  // Same cashback auto-fill as the normal expense form: a card+category rule, else
  // the card's default rate.
  function resolveRatePct(cardId, cat) {
    const rule = (rules || []).find((r) => r.card_id === cardId && r.category === cat);
    let rate = null;
    if (rule) rate = Number(rule.rate);
    else {
      const card = cards.find((c2) => c2.id === cardId);
      if (card && card.default_cashback_rate != null) rate = Number(card.default_cashback_rate);
    }
    return rate == null ? "" : String(Math.round(rate * 10000) / 100);
  }
  function onSourceChange(value) {
    setPaymentSource(value);
    setCashbackPct(value.startsWith("card:") ? resolveRatePct(value.slice(5), category) : "");
  }
  function onCategoryChange(value) {
    setCategory(value);
    if (isCard) setCashbackPct(resolveRatePct(paymentSource.slice(5), value));
  }

  const setP = (i, changes) =>
    setParticipants((ps) =>
      ps.map((p, idx) => {
        if (idx !== i) return p;
        const next = { ...p, ...changes };
        if (changes.profile_id !== undefined && (!p.charged_to || p.charged_to === p.profile_id)) {
          next.charged_to = changes.profile_id;
        }
        return next;
      })
    );
  const addP = () => setParticipants((ps) => [...ps, { profile_id: "", subtotal: "", charged_to: "" }]);
  const removeP = (i) => setParticipants((ps) => ps.filter((_, idx) => idx !== i));

  const valid = participants.filter((p) => p.profile_id);
  const { perPerson, grand } = computeSplit({
    mode, amount, tax, tip, deliveryFee, serviceFee, discount, participants: valid, payerId: primaryId,
  });
  const owedFor = (pid) => perPerson.find((pp) => pp.profile_id === pid)?.owed ?? 0;
  const enteredAmount = amount === "" ? null : Number(amount);
  const mismatch = itemized && enteredAmount != null && Math.abs(grand - enteredAmount) >= 0.01;

  function exit(type) {
    onExitGroup(type, { transaction_date: date, merchant, category, paymentSource, cashbackPct });
  }

  async function submit(e) {
    e.preventDefault();
    if (!paymentSource) return setError("Pick how you paid.");
    if (valid.length === 0) return setError("Add at least one person.");
    const ids = valid.map((p) => p.profile_id);
    if (new Set(ids).size !== ids.length) return setError("Each person can only appear once.");

    const payload = {
      mode,
      card_id: isCard ? paymentSource.slice(5) : null,
      account_id: isCard ? null : paymentSource.slice(8),
      transaction_date: date,
      merchant: merchant.trim() || null,
      category: category || null,
      cashback_rate: isCard && cashbackPct !== "" ? pctToDec(cashbackPct) : null,
      notes: notes.trim() || null,
      amount: amount !== "" ? Number(amount) : null,
      tax: itemized ? Number(tax) || 0 : 0,
      tip: itemized ? Number(tip) || 0 : 0,
      delivery_fee: itemized ? Number(deliveryFee) || 0 : 0,
      service_fee: itemized ? Number(serviceFee) || 0 : 0,
      discount: itemized ? Number(discount) || 0 : 0,
      subtotal: itemized ? null : Number(amount) || 0, // even: split the whole amount
      payer_profile_id: primaryId || null,
      participants: valid.map((p) => ({
        profile_id: p.profile_id,
        subtotal: itemized ? Number(p.subtotal) || 0 : null,
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Row 1 */}
        <Field label="Date"><DateInput value={date} onChange={setDate} /></Field>
        <Field label="Merchant"><Input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="e.g. DoorDash" /></Field>
        <Field label="Category">
          <Select value={category} onChange={(e) => onCategoryChange(e.target.value)}>
            <option value="">Category…</option>
            {categoryList.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </Select>
        </Field>

        {/* Row 2 */}
        <Field label="Type">
          <Select value="group" onChange={(e) => e.target.value !== "group" && exit(e.target.value)}>
            <option value="purchase">Purchase</option>
            <option value="refund">Refund</option>
            <option value="group">Group Purchase</option>
          </Select>
        </Field>
        <Field label="Payment source">
          <Select value={paymentSource} onChange={(e) => onSourceChange(e.target.value)}>
            <option value="">Payment source…</option>
            <optgroup label="Credit cards">
              {cards.map((c2) => <option key={c2.id} value={`card:${c2.id}`}>{c2.name}</option>)}
            </optgroup>
            <optgroup label="Accounts (bank / cash)">
              {accounts.map((a) => <option key={a.id} value={`account:${a.id}`}>{a.name}</option>)}
            </optgroup>
          </Select>
        </Field>
        <Field label="Cashback %" hint={isCard ? undefined : "Card payments only"}>
          <Input type="number" step="0.01" placeholder="0" value={cashbackPct} onChange={(e) => setCashbackPct(e.target.value)} disabled={!isCard} />
        </Field>

        {/* Row 3 */}
        <Field label="Amount" hint={itemized ? "Actual total, to check the split" : "Total to split equally"}>
          <AmountInput value={amount} onChange={setAmount} />
        </Field>
        {itemized && <Field label="Delivery fee"><AmountInput value={deliveryFee} onChange={setDeliveryFee} /></Field>}
        {itemized && <Field label="Service fee"><AmountInput value={serviceFee} onChange={setServiceFee} /></Field>}

        {/* Row 4 (itemized only) */}
        {itemized && <Field label="Tax"><AmountInput value={tax} onChange={setTax} /></Field>}
        {itemized && <Field label="Tip"><AmountInput value={tip} onChange={setTip} /></Field>}
        {itemized && <Field label="Discount"><AmountInput value={discount} onChange={setDiscount} /></Field>}

        {/* Row 5: notes (2 cols) + split (1 col) */}
        <Field label="Notes" className="sm:col-span-2 lg:col-span-2">
          <Input placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1 text-xs text-muted">
            Split
            <span
              className="cursor-help"
              title={itemized
                ? "By each order: tax, tip, fees & discount split by order size."
                : "Evenly: the whole amount split equally among everyone."}
            >
              <Info size={12} />
            </span>
          </span>
          <Select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="itemized">By each order</option>
            <option value="even">Evenly</option>
          </Select>
        </div>
      </div>

      {/* Participants table */}
      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-muted">People in this order</div>
        <Table className="table-fixed min-w-[34rem]">
          <THead>
            <tr>
              <TH className="text-center">Whose order</TH>
              {itemized && <TH className="text-center">Order</TH>}
              <TH className="text-center">Charge to</TH>
              <TH className="text-center">Share</TH>
              <TH className="w-12"></TH>
            </tr>
          </THead>
          <tbody>
            {participants.map((p, i) => (
              <TR key={i}>
                <TD>
                  <Select value={p.profile_id} onChange={(e) => setP(i, { profile_id: e.target.value })}>
                    <option value="">Whose order…</option>
                    {profiles.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}{pr.is_primary ? " (me)" : ""}</option>)}
                  </Select>
                </TD>
                {itemized && (
                  <TD><AmountInput value={p.subtotal} onChange={(v) => setP(i, { subtotal: v })} /></TD>
                )}
                <TD>
                  <Select value={p.charged_to || p.profile_id} onChange={(e) => setP(i, { charged_to: e.target.value })} disabled={!p.profile_id}>
                    {profiles.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}{pr.is_primary ? " (me)" : ""}</option>)}
                  </Select>
                </TD>
                <TD align="center">
                  {p.profile_id ? <strong className="text-ink"><Amount value={owedFor(p.profile_id)} /></strong> : <span className="text-muted">—</span>}
                </TD>
                <TD align="center">
                  <button type="button" onClick={() => removeP(i)} title="Remove" className="text-muted hover:text-danger">
                    <Trash2 size={15} />
                  </button>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
        <Button type="button" size="sm" variant="ghost" onClick={addP}>
          <Plus size={14} /> Add person
        </Button>
      </div>

      {/* Total + submit, bottom-right */}
      <div className="flex flex-wrap items-center justify-end gap-4 pt-1">
        <span className="text-sm">
          <span className="text-muted">Split Total </span>
          <strong className="text-ink"><Amount value={grand} /></strong>
          {mismatch && <span className="text-danger"> — doesn't match {money(enteredAmount)}</span>}
        </span>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Saving…" : groupId ? "Save Group" : "Add Group Purchase"}
        </Button>
      </div>
    </form>
  );
}
