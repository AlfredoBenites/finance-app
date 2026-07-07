import { useState } from "react";
import { Button, Field, Select, Input, Textarea, DateInput, AmountInput, Autocomplete, cn } from "../ui";
import { todayLocal } from "../../format";
import RefundPicker from "./RefundPicker";

export const ADD_NEW = "__add_new__";
export const today = todayLocal;
export const EMPTY_FORM = {
  transaction_date: today(),
  merchant: "",
  category: "",
  type: "purchase",
  amount: "",
  profile_id: "",
  paymentSource: "", // "card:<id>" or "account:<id>"
  cashbackPct: "",
  refund_for_id: null, // when type === "refund", the purchase it offsets
  notes: "",
};

// Encapsulates an expense form's state and the little bits of logic that tie
// fields together (resolving a card's cashback rate, auto-filling a merchant's
// remembered category). Used twice on the page: once for adding, once for the
// inline edit form, so both behave identically.
export function useExpenseForm(deps, initial = EMPTY_FORM) {
  const { cards, rules, merchantDefaults, onAddCategory } = deps;
  const [form, setForm] = useState(initial);
  const setField = (name, value) => setForm((f) => ({ ...f, [name]: value }));

  function resolveRatePct(cardId, category) {
    const rule = rules.find((r) => r.card_id === cardId && r.category === category);
    let rate = null;
    if (rule) rate = Number(rule.rate);
    else {
      const card = cards.find((c) => c.id === cardId);
      if (card && card.default_cashback_rate != null) rate = Number(card.default_cashback_rate);
    }
    return rate == null ? "" : String(Math.round(rate * 10000) / 100);
  }

  function onSourceChange(value) {
    if (value.startsWith("card:")) {
      const cardId = value.slice(5);
      setForm((f) => ({ ...f, paymentSource: value, cashbackPct: resolveRatePct(cardId, f.category) }));
    } else {
      setForm((f) => ({ ...f, paymentSource: value, cashbackPct: "" }));
    }
  }

  function setCategory(category) {
    setForm((f) => {
      const pct = f.paymentSource.startsWith("card:")
        ? resolveRatePct(f.paymentSource.slice(5), category)
        : f.cashbackPct;
      return { ...f, category, cashbackPct: pct };
    });
  }

  async function onCategorySelect(value) {
    if (value === ADD_NEW) {
      const name = await onAddCategory();
      if (name) setCategory(name);
      return;
    }
    setCategory(value);
  }

  function onMerchantChange(value) {
    setField("merchant", value);
    const def = merchantDefaults.find((m) => m.merchant.toLowerCase() === value.trim().toLowerCase());
    if (def) setCategory(def.category);
  }

  const reset = (next = EMPTY_FORM) => setForm(next);

  return { form, setForm, setField, onSourceChange, onCategorySelect, onMerchantChange, reset };
}

// The grid of fields. `instance` is a useExpenseForm() return.
export function ExpenseFields({
  instance,
  profiles,
  cards,
  accounts,
  categoryList,
  merchantNames,
  refundCandidates = [],
  onSubmit,
  onCancel,
  submitLabel,
  panel,
}) {
  const { form, setField, onSourceChange, onCategorySelect, onMerchantChange } = instance;
  const isCard = form.paymentSource.startsWith("card:");
  const fullWidth = panel ? "col-span-2" : "sm:col-span-2 lg:col-span-3";
  // Same card's purchases, most recent first, as candidates for a refund link.
  const refundCardId = isCard ? form.paymentSource.slice(5) : null;
  const refundOptions = refundCardId
    ? refundCandidates
        .filter((t) => t.credit_card_id === refundCardId && Number(t.amount) < 0)
        .sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1))
    : [];
  return (
    <form
      onSubmit={onSubmit}
      className={panel ? "grid grid-cols-2 gap-3" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"}
    >
      <Field label="Date">
        <DateInput value={form.transaction_date} onChange={(v) => setField("transaction_date", v)} />
      </Field>
      <Field label="Merchant">
        <Autocomplete value={form.merchant} onChange={onMerchantChange} options={merchantNames} placeholder="Merchant" />
      </Field>
      <Field label="Category">
        <Select value={form.category} onChange={(e) => onCategorySelect(e.target.value)}>
          <option value="">Category…</option>
          {categoryList.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
          <option value={ADD_NEW}>➕ Add new category…</option>
        </Select>
      </Field>
      <Field label="Type">
        <Select
          value={form.type}
          onChange={(e) => {
            setField("type", e.target.value);
            if (e.target.value !== "refund") setField("refund_for_id", null);
          }}
        >
          <option value="purchase">Purchase</option>
          <option value="refund">Refund</option>
          {!panel && <option value="group">Group Purchase</option>}
        </Select>
      </Field>
      <Field label="Profile">
        <Select value={form.profile_id} onChange={(e) => setField("profile_id", e.target.value)}>
          <option value="">Profile…</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="Amount">
        <AmountInput value={form.amount} onChange={(v) => setField("amount", v)} />
      </Field>
      <Field label="Payment source">
        <Select value={form.paymentSource} onChange={(e) => onSourceChange(e.target.value)}>
          <option value="">Payment source…</option>
          <optgroup label="Credit cards">
            {cards.map((c) => (
              <option key={c.id} value={`card:${c.id}`}>{c.name}</option>
            ))}
          </optgroup>
          <optgroup label="Accounts (bank / cash)">
            {accounts.map((a) => (
              <option key={a.id} value={`account:${a.id}`}>{a.name}</option>
            ))}
          </optgroup>
        </Select>
      </Field>
      <Field label="Cashback %" hint={isCard ? undefined : "Card payments only"}>
        <Input
          type="number"
          step="0.01"
          placeholder="0"
          value={form.cashbackPct}
          onChange={(e) => setField("cashbackPct", e.target.value)}
          disabled={!isCard}
        />
      </Field>
      {panel ? (
        <Field label="Note" className="col-span-2">
          <Textarea rows={3} placeholder="Optional" value={form.notes} onChange={(e) => setField("notes", e.target.value)} />
        </Field>
      ) : (
        <Field label="Note">
          <Input placeholder="Optional" value={form.notes} onChange={(e) => setField("notes", e.target.value)} />
        </Field>
      )}
      {form.type === "refund" && (
        <Field
          label="Refund for (optional)"
          hint={isCard ? "The purchase this refund offsets, so suggestions move the remaining amount." : "Pick a credit-card payment source to link a purchase."}
          className={fullWidth}
        >
          <RefundPicker
            value={form.refund_for_id}
            candidates={refundOptions}
            onChange={(id) => setField("refund_for_id", id)}
          />
        </Field>
      )}

      {/* In the panel edit form: Save on the left, Cancel on the right. */}
      <div className={cn("flex items-center gap-2", fullWidth, panel ? "justify-between" : "justify-end")}>
        {panel ? (
          <>
            <Button type="submit" variant="primary">{submitLabel}</Button>
            {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
          </>
        ) : (
          <>
            {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
            <Button type="submit" variant="primary">{submitLabel}</Button>
          </>
        )}
      </div>
    </form>
  );
}
