import { useEffect, useState } from "react";
import { profilesApi, creditCardsApi, transactionsApi } from "../api/client";

// Hardcoded categories for the MVP (SPEC.md section 10).
const CATEGORIES = [
  "Food", "Gas", "Groceries", "Bills", "Insurance", "School", "Clothes",
  "Professional", "Car", "Health", "Gifts", "Subscriptions", "Travel", "Other",
];

const today = () => new Date().toISOString().slice(0, 10);
const money = (n) => `${n < 0 ? "-" : ""}$${Math.abs(Number(n)).toFixed(2)}`;

const EMPTY_FORM = {
  transaction_date: today(),
  merchant: "",
  category: CATEGORIES[0],
  type: "purchase", // purchase -> stored negative; refund -> stored positive
  amount: "",
  profile_id: "",
  credit_card_id: "",
  cashbackPct: "",
};

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [cards, setCards] = useState([]);
  const [error, setError] = useState(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);

  const [filters, setFilters] = useState({ profile_id: "", is_paid_back: "", search: "" });

  const profileName = (id) => profiles.find((p) => p.id === id)?.name ?? "—";
  const cardName = (id) => cards.find((c) => c.id === id)?.name ?? "—";

  async function loadLookups() {
    try {
      const [p, c] = await Promise.all([profilesApi.list(), creditCardsApi.list()]);
      setProfiles(p);
      setCards(c);
    } catch (e) {
      setError(e.message);
    }
  }

  async function loadTransactions() {
    try {
      setTransactions(await transactionsApi.list(filters));
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    loadLookups();
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [filters]);

  function setField(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  function startEdit(t) {
    setEditingId(t.id);
    setError(null);
    setForm({
      transaction_date: t.transaction_date,
      merchant: t.merchant ?? "",
      category: t.category ?? CATEGORIES[0],
      type: Number(t.amount) < 0 ? "purchase" : "refund",
      amount: String(Math.abs(Number(t.amount))),
      profile_id: t.profile_id,
      credit_card_id: t.credit_card_id,
      cashbackPct: t.cashback_rate != null ? String(Number(t.cashback_rate) * 100) : "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.amount || !form.profile_id || !form.credit_card_id) {
      setError("Amount, profile, and card are required.");
      return;
    }
    // Purchases store as negative; refunds/income stay positive.
    const magnitude = Math.abs(Number(form.amount));
    const amount = form.type === "purchase" ? -magnitude : magnitude;
    const rate = form.cashbackPct === "" ? null : Number(form.cashbackPct) / 100;
    const payload = {
      transaction_date: form.transaction_date,
      merchant: form.merchant.trim() || null,
      category: form.category,
      amount,
      profile_id: form.profile_id,
      credit_card_id: form.credit_card_id,
      cashback_rate: rate,
    };
    try {
      if (editingId) {
        await transactionsApi.update(editingId, payload);
      } else {
        await transactionsApi.create(payload);
      }
      cancelEdit();
      setError(null);
      loadTransactions();
    } catch (e) {
      setError(e.message);
    }
  }

  async function togglePaid(t) {
    try {
      await transactionsApi.update(t.id, {
        is_paid_back: !t.is_paid_back,
        paid_back_date: !t.is_paid_back ? today() : null,
      });
      loadTransactions();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(id) {
    try {
      await transactionsApi.remove(id);
      if (editingId === id) cancelEdit();
      loadTransactions();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <h1>Transactions</h1>

      <form onSubmit={handleSubmit} style={{ flexWrap: "wrap" }}>
        <input
          type="date"
          value={form.transaction_date}
          onChange={(e) => setField("transaction_date", e.target.value)}
        />
        <input
          placeholder="Merchant"
          value={form.merchant}
          onChange={(e) => setField("merchant", e.target.value)}
        />
        <select value={form.category} onChange={(e) => setField("category", e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={form.type} onChange={(e) => setField("type", e.target.value)}>
          <option value="purchase">Purchase</option>
          <option value="refund">Refund / Income</option>
        </select>
        <input
          type="number"
          step="0.01"
          placeholder="Amount"
          value={form.amount}
          onChange={(e) => setField("amount", e.target.value)}
        />
        <select value={form.profile_id} onChange={(e) => setField("profile_id", e.target.value)}>
          <option value="">Profile…</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={form.credit_card_id}
          onChange={(e) => setField("credit_card_id", e.target.value)}
        >
          <option value="">Card…</option>
          {cards.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input
          type="number"
          step="0.01"
          placeholder="Cashback %"
          value={form.cashbackPct}
          onChange={(e) => setField("cashbackPct", e.target.value)}
        />
        <button type="submit">{editingId ? "Save" : "Add"}</button>
        {editingId && (
          <button type="button" onClick={cancelEdit}>
            Cancel
          </button>
        )}
      </form>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <select
          value={filters.profile_id}
          onChange={(e) => setFilters((f) => ({ ...f, profile_id: e.target.value }))}
        >
          <option value="">All profiles</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={filters.is_paid_back}
          onChange={(e) => setFilters((f) => ({ ...f, is_paid_back: e.target.value }))}
        >
          <option value="">Paid + unpaid</option>
          <option value="false">Unpaid only</option>
          <option value="true">Paid only</option>
        </select>
        <input
          placeholder="Search merchant"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
        />
      </div>

      {error && <p style={{ color: "#dc2626" }}>Error: {error}</p>}

      {transactions.length === 0 && <p>No transactions match.</p>}

      {transactions.map((t) => (
        <div className="card" key={t.id}>
          <span>
            {t.transaction_date} · {t.merchant || "—"} · {t.category || "—"}
            <br />
            <small>
              {profileName(t.profile_id)} · {cardName(t.credit_card_id)} ·{" "}
              {money(t.amount)}
              {t.cashback_amount != null ? ` · CB ${money(t.cashback_amount)}` : ""} ·{" "}
              {t.is_paid_back ? "paid back" : "unpaid"}
            </small>
          </span>
          <span style={{ display: "flex", gap: 6 }}>
            <button onClick={() => startEdit(t)}>Edit</button>
            <button onClick={() => togglePaid(t)}>
              {t.is_paid_back ? "Mark unpaid" : "Mark paid"}
            </button>
            <button className="danger" onClick={() => handleDelete(t.id)}>
              Delete
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
