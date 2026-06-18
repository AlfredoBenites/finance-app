import { useEffect, useState } from "react";
import { incomeApi, accountsApi } from "../api/client";
import { INCOME_TYPES } from "../constants";

const today = () => new Date().toISOString().slice(0, 10);
const money = (n) => `$${Number(n).toFixed(2)}`;

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
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);

  const accountName = (id) => accounts.find((a) => a.id === id)?.name ?? "—";

  async function load() {
    try {
      const [inc, accts] = await Promise.all([incomeApi.list(), accountsApi.list()]);
      setIncome(inc);
      setAccounts(accts);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function setField(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.source.trim() || !form.amount) {
      setError("Source and amount are required.");
      return;
    }
    try {
      await incomeApi.create({
        income_date: form.income_date,
        source: form.source.trim(),
        category: form.category,
        amount: Math.abs(Number(form.amount)),
        account_id: form.account_id || null,
        notes: form.notes.trim() || null,
      });
      setForm({ ...EMPTY, income_date: form.income_date });
      setError(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(id) {
    try {
      await incomeApi.remove(id);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  const total = income.reduce((s, i) => s + Number(i.amount), 0);
  const byType = {};
  for (const i of income) byType[i.category || "Other"] = (byType[i.category || "Other"] || 0) + Number(i.amount);

  return (
    <div>
      <h1>Income</h1>

      <form onSubmit={handleAdd} style={{ flexWrap: "wrap" }}>
        <input
          type="date"
          value={form.income_date}
          onChange={(e) => setField("income_date", e.target.value)}
        />
        <input
          placeholder="Source (e.g., DoodyCalls, cut grass for dad)"
          value={form.source}
          onChange={(e) => setField("source", e.target.value)}
        />
        <select value={form.category} onChange={(e) => setField("category", e.target.value)}>
          {INCOME_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input
          type="number"
          step="0.01"
          placeholder="Amount"
          value={form.amount}
          onChange={(e) => setField("amount", e.target.value)}
        />
        <select value={form.account_id} onChange={(e) => setField("account_id", e.target.value)}>
          <option value="">Into account… (optional)</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <input
          placeholder="Notes"
          value={form.notes}
          onChange={(e) => setField("notes", e.target.value)}
        />
        <button type="submit">Add</button>
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
      {income.length === 0 && <p>No income yet.</p>}
      {income.map((i) => (
        <div className="card" key={i.id}>
          <span>
            {i.income_date} · {i.source} · {i.category || "—"}
            <br />
            <small>
              {money(i.amount)} · into {accountName(i.account_id)}
              {i.notes ? ` · ${i.notes}` : ""}
            </small>
          </span>
          <button className="danger" onClick={() => handleDelete(i.id)}>
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
