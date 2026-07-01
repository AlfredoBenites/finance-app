import { useEffect, useState } from "react";
import { incomeApi, accountsApi, bucketsApi } from "../api/client";
import { INCOME_TYPES } from "../constants";
import YearSelect, { CURRENT_YEAR } from "../components/YearSelect";
import usePersistedState from "../hooks/usePersistedState";
import { formatDate } from "../format";
import {
  PageHeader,
  Card,
  Button,
  Badge,
  Banner,
  StatCard,
  Amount,
  Toggle,
  Select,
  Input,
  Field,
  DateInput,
  AmountInput,
} from "../components/ui";

const today = () => new Date().toISOString().slice(0, 10);
const ADD_NEW = "__add_new__";
const uniqSorted = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b));

const EMPTY = {
  income_date: today(),
  source: "",
  category: INCOME_TYPES[0],
  amount: "",
  account_id: "",
  notes: "",
};

export default function IncomePage() {
  const [income, setIncome] = useState([]);
  const [accounts, setAccounts] = useState([]);
  // All income (any year) used only to populate the source/category dropdowns.
  const [pool, setPool] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [hideRepayments, setHideRepayments] = usePersistedState("income.hideRepayments", false);

  const accountName = (id) => accounts.find((a) => a.id === id)?.name ?? "—";

  async function load() {
    try {
      const [inc, accts] = await Promise.all([
        incomeApi.list(year === "all" ? undefined : year),
        accountsApi.list(),
      ]);
      setIncome(inc);
      setAccounts(accts);
    } catch (e) {
      setError(e.message);
    }
  }

  async function loadPool() {
    try {
      setPool(await incomeApi.list()); // all years
    } catch (e) {
      // dropdown suggestions are best-effort; ignore failures
    }
  }

  useEffect(() => {
    load();
  }, [year]);

  useEffect(() => {
    loadPool();
  }, []);

  function setField(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  function onCategorySelect(value) {
    if (value === ADD_NEW) {
      const name = window.prompt("New income category name:");
      if (name && name.trim()) setField("category", name.trim());
      return;
    }
    setField("category", value);
  }

  function onSourceSelect(value) {
    if (value === ADD_NEW) {
      const name = window.prompt("New source name:");
      if (name && name.trim()) setField("source", name.trim());
      return;
    }
    setField("source", value);
  }

  function startEdit(i) {
    setEditingId(i.id);
    setError(null);
    setForm({
      income_date: i.income_date,
      source: i.source ?? "",
      category: i.category ?? INCOME_TYPES[0],
      amount: String(Math.abs(Number(i.amount))),
      account_id: i.account_id ?? "",
      notes: i.notes ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY);
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.source.trim() || !form.amount || !form.account_id) {
      setError("Source, amount, and account are required.");
      return;
    }
    const payload = {
      income_date: form.income_date,
      source: form.source.trim(),
      category: form.category,
      amount: Math.abs(Number(form.amount)),
      account_id: form.account_id || null,
      notes: form.notes.trim() || null,
    };
    try {
      if (editingId) await incomeApi.update(editingId, payload);
      else await incomeApi.create(payload);
      setEditingId(null);
      setForm({ ...EMPTY, income_date: form.income_date });
      setError(null);
      load();
      loadPool(); // a new source/category becomes a future suggestion
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(id) {
    try {
      await incomeApi.remove(id);
      load();
      loadPool();
    } catch (e) {
      setError(e.message);
    }
  }

  async function undoAllocation(id) {
    try {
      await bucketsApi.undoIncomeAllocation({ income_id: id });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  // Dropdown options: known defaults + everything used before + the current
  // (possibly just-added) value, so a freshly typed entry stays selected.
  const categoryOptions = uniqSorted([...INCOME_TYPES, ...pool.map((e) => e.category), form.category]);
  const sourceOptions = uniqSorted([...pool.map((e) => e.source), form.source]);

  const visible = hideRepayments
    ? income.filter((i) => (i.category || "") !== "Repayment")
    : income;
  const total = visible.reduce((s, i) => s + Number(i.amount), 0);
  const byType = {};
  for (const i of visible) byType[i.category || "Other"] = (byType[i.category || "Other"] || 0) + Number(i.amount);
  const byTypeSorted = Object.entries(byType).sort((a, b) => b[1] - a[1]);

  // Show the year in row dates only when viewing all time; otherwise "Jul 8".
  const shortDate = (iso) => (year === "all" ? formatDate(iso) : formatDate(iso).replace(/,\s*\d{4}$/, ""));

  return (
    <div>
      <PageHeader
        title="Income"
        subtitle="Money coming in, by source and category."
        actions={
          <>
            <Toggle on={hideRepayments} onClick={() => setHideRepayments((v) => !v)} label="Hide repayments" />
            <YearSelect value={year} onChange={setYear} />
          </>
        }
      />

      {/* Add / edit form */}
      <Card className="mb-6">
        <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Date">
            <DateInput value={form.income_date} onChange={(v) => setField("income_date", v)} />
          </Field>
          <Field label="Source">
            <Select value={form.source} onChange={(e) => onSourceSelect(e.target.value)}>
              <option value="">Source…</option>
              {sourceOptions.map((sName) => (
                <option key={sName} value={sName}>{sName}</option>
              ))}
              <option value={ADD_NEW}>➕ Add new source…</option>
            </Select>
          </Field>
          <Field label="Category">
            <Select value={form.category} onChange={(e) => onCategorySelect(e.target.value)}>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value={ADD_NEW}>➕ Add new category…</option>
            </Select>
          </Field>
          <Field label="Amount">
            <AmountInput value={form.amount} onChange={(v) => setField("amount", v)} />
          </Field>
          <Field label="Into account">
            <Select value={form.account_id} onChange={(e) => setField("account_id", e.target.value)} required>
              <option value="">Into account…</option>
              {accounts.filter((a) => a.is_active !== false).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Notes">
            <Input placeholder="Optional" value={form.notes} onChange={(e) => setField("notes", e.target.value)} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-3 flex items-center justify-end gap-2">
            {editingId && (
              <Button type="button" variant="ghost" onClick={cancelEdit}>Cancel</Button>
            )}
            <Button type="submit" variant="primary">{editingId ? "Save changes" : "Add income"}</Button>
          </div>
        </form>
      </Card>

      {error && <Banner tone="danger" className="mb-4">Error: {error}</Banner>}

      {/* Totals */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="Total income" value={<Amount value={total} tone="green" />} accent />
        {byTypeSorted.map(([type, amt]) => (
          <StatCard key={type} label={type} value={<Amount value={amt} />} />
        ))}
      </section>

      {/* Entries */}
      <h2 className="text-lg font-semibold text-ink mb-3">Entries</h2>
      {visible.length === 0 ? (
        <p className="text-muted text-sm">No income yet.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((i) => (
            <Card key={i.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-ink font-medium">{i.source}</span>
                  <Badge tone="neutral">{i.category || "Other"}</Badge>
                  {i.allocated_bucket_id && <Badge tone="success">Allocated</Badge>}
                </div>
                <div className="text-xs text-muted mt-1 flex items-center gap-2 flex-wrap">
                  <span>{shortDate(i.income_date)}</span>
                  <span>·</span>
                  <span>into {accountName(i.account_id)}</span>
                  {i.notes && (
                    <>
                      <span>·</span>
                      <span className="truncate max-w-[16rem]">{i.notes}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <strong className="w-28 text-right">
                  <Amount value={i.amount} tone="green" />
                </strong>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => startEdit(i)}>Edit</Button>
                  {i.allocated_bucket_id && (
                    <Button size="sm" onClick={() => undoAllocation(i.id)} title="Reverse the bucket/balance this income added">
                      Undo allocation
                    </Button>
                  )}
                  <Button size="sm" variant="danger" onClick={() => handleDelete(i.id)}>Delete</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
