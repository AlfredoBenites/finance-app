import { useEffect, useState } from "react";
import { incomeApi, accountsApi, bucketsApi } from "../api/client";
import { INCOME_TYPES } from "../constants";
import YearSelect, { CURRENT_YEAR } from "../components/YearSelect";
import usePersistedState from "../hooks/usePersistedState";
import { money } from "../format";

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

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Income</h1>
        <span style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setHideRepayments((v) => !v)}
            style={{ background: hideRepayments ? "#2563eb" : "#9ca3af" }}
          >
            Hide repayments: {hideRepayments ? "on" : "off"}
          </button>
          <YearSelect value={year} onChange={setYear} />
        </span>
      </div>

      <form onSubmit={handleAdd} style={{ flexWrap: "wrap" }}>
        <input
          type="date"
          value={form.income_date}
          onChange={(e) => setField("income_date", e.target.value)}
        />
        <select value={form.source} onChange={(e) => onSourceSelect(e.target.value)}>
          <option value="">Source…</option>
          {sourceOptions.map((sName) => (
            <option key={sName} value={sName}>{sName}</option>
          ))}
          <option value={ADD_NEW}>➕ Add new source…</option>
        </select>
        <select value={form.category} onChange={(e) => onCategorySelect(e.target.value)}>
          {categoryOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
          <option value={ADD_NEW}>➕ Add new category…</option>
        </select>
        <input
          type="number"
          step="0.01"
          placeholder="Amount"
          value={form.amount}
          onChange={(e) => setField("amount", e.target.value)}
        />
        <select
          value={form.account_id}
          onChange={(e) => setField("account_id", e.target.value)}
          required
        >
          <option value="">Into account…</option>
          {accounts.filter((a) => a.is_active !== false).map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <input
          placeholder="Notes"
          value={form.notes}
          onChange={(e) => setField("notes", e.target.value)}
        />
        <button type="submit">{editingId ? "Save" : "Add"}</button>
        {editingId && <button type="button" onClick={cancelEdit}>Cancel</button>}
      </form>

      {error && <p style={{ color: "#dc2626" }}>Error: {error}</p>}

      <div className="card">
        <span><strong>Total income</strong></span>
        <strong>{money(total)}</strong>
      </div>
      {Object.entries(byType)
        .sort((a, b) => b[1] - a[1])
        .map(([type, amt]) => (
          <div className="card" key={type}>
            <span>{type}</span>
            <span>{money(amt)}</span>
          </div>
        ))}

      <h2>Entries</h2>
      {visible.length === 0 && <p>No income yet.</p>}
      {visible.map((i) => (
        <div className="card" key={i.id}>
          <span>
            {i.income_date} · {i.source} · {i.category || "—"}
            <br />
            <small>
              {money(i.amount)} · into {accountName(i.account_id)}
              {i.notes ? ` · ${i.notes}` : ""}
              {i.allocated_bucket_id ? " · 🪣 allocated" : ""}
            </small>
          </span>
          <span style={{ display: "flex", gap: 6 }}>
            <button onClick={() => startEdit(i)}>Edit</button>
            {i.allocated_bucket_id && (
              <button onClick={() => undoAllocation(i.id)} title="Reverse the bucket/balance this income added">
                Undo allocation
              </button>
            )}
            <button className="danger" onClick={() => handleDelete(i.id)}>
              Delete
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
