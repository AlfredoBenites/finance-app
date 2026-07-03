import { useState } from "react";
import { Button, Field, Select, Input, Textarea, DateInput, AmountInput, cn } from "../ui";
import { INCOME_TYPES } from "../../constants";
import { todayLocal } from "../../format";

export const ADD_NEW = "__add_new__";
export const today = todayLocal;
export const EMPTY_INCOME = {
  income_date: today(),
  source: "",
  category: INCOME_TYPES[0],
  amount: "",
  account_id: "",
  notes: "",
};

// Form state + the little "add new source/category" prompts. Shared by the top
// add form and the inline edit form in the detail panel.
export function useIncomeForm(initial = EMPTY_INCOME) {
  const [form, setForm] = useState(initial);
  const setField = (name, value) => setForm((f) => ({ ...f, [name]: value }));

  function onCategorySelect(value) {
    if (value === ADD_NEW) {
      const n = window.prompt("New income category name:");
      if (n && n.trim()) setField("category", n.trim());
      return;
    }
    setField("category", value);
  }
  function onSourceSelect(value) {
    if (value === ADD_NEW) {
      const n = window.prompt("New source name:");
      if (n && n.trim()) setField("source", n.trim());
      return;
    }
    setField("source", value);
  }
  const reset = (next = EMPTY_INCOME) => setForm(next);

  return { form, setForm, setField, onCategorySelect, onSourceSelect, reset };
}

export function IncomeFields({ instance, accounts, categoryOptions, sourceOptions, onSubmit, onCancel, submitLabel, panel }) {
  const { form, setField, onCategorySelect, onSourceSelect } = instance;
  // A source/category the user just typed in the prompt won't be in the options
  // list yet (it isn't saved until submit). Include the current value so the
  // Select actually shows it as selected instead of falling back to blank.
  const sourceOpts = form.source && !sourceOptions.includes(form.source) ? [form.source, ...sourceOptions] : sourceOptions;
  const categoryOpts = form.category && !categoryOptions.includes(form.category) ? [form.category, ...categoryOptions] : categoryOptions;
  // The top add form lays out in two rows of three (Date · Source · Category /
  // Account · Amount · Notes) via order-* classes; the panel keeps DOM order.
  return (
    <form
      onSubmit={onSubmit}
      className={panel ? "grid grid-cols-2 gap-3" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"}
    >
      <Field label="Source" className={panel ? "col-span-2" : "order-2"}>
        <Select value={form.source} onChange={(e) => onSourceSelect(e.target.value)}>
          <option value="">Source…</option>
          {sourceOpts.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
          <option value={ADD_NEW}>➕ Add new source…</option>
        </Select>
      </Field>
      <Field label="Category" className={panel ? "" : "order-3"}>
        <Select value={form.category} onChange={(e) => onCategorySelect(e.target.value)}>
          {categoryOpts.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
          <option value={ADD_NEW}>➕ Add new category…</option>
        </Select>
      </Field>
      <Field label="Account" className={panel ? "" : "order-4"}>
        <Select value={form.account_id} onChange={(e) => setField("account_id", e.target.value)} required>
          <option value="">Account…</option>
          {accounts.filter((a) => a.is_active !== false).map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="Date" className={panel ? "" : "order-1"}>
        <DateInput value={form.income_date} onChange={(v) => setField("income_date", v)} />
      </Field>
      <Field label="Amount" className={panel ? "" : "order-5"}>
        <AmountInput value={form.amount} onChange={(v) => setField("amount", v)} />
      </Field>
      <Field label="Notes" className={panel ? "col-span-2" : "order-6"}>
        {panel ? (
          <Textarea rows={3} placeholder="Optional" value={form.notes} onChange={(e) => setField("notes", e.target.value)} />
        ) : (
          <Input placeholder="Optional" value={form.notes} onChange={(e) => setField("notes", e.target.value)} />
        )}
      </Field>
      {/* In the panel edit form: Save on the left, Cancel on the right. */}
      <div className={cn("flex items-center gap-2", panel ? "col-span-2 justify-between" : "order-7 sm:col-span-2 lg:col-span-3 justify-end")}>
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
