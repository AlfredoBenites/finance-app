import { useEffect, useState } from "react";
import {
  profilesApi,
  creditCardsApi,
  accountsApi,
  transactionsApi,
  cashbackRulesApi,
  categoriesApi,
  merchantCategoriesApi,
} from "../api/client";
import { CATEGORIES as FALLBACK_CATEGORIES } from "../constants";

const today = () => new Date().toISOString().slice(0, 10);
const money = (n) => `${n < 0 ? "-" : ""}$${Math.abs(Number(n)).toFixed(2)}`;
const ADD_NEW = "__add_new__";

const EMPTY_FORM = {
  transaction_date: today(),
  merchant: "",
  category: "",
  type: "purchase",
  amount: "",
  profile_id: "",
  paymentSource: "", // "card:<id>" or "account:<id>"
  cashbackPct: "",
};

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [cards, setCards] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [rules, setRules] = useState([]);
  const [categoryList, setCategoryList] = useState([]);
  const [merchantDefaults, setMerchantDefaults] = useState([]); // [{merchant, category}]
  const [error, setError] = useState(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [filters, setFilters] = useState({ profile_id: "", is_paid_back: "", search: "" });

  const profileName = (id) => profiles.find((p) => p.id === id)?.name ?? "—";
  const cardName = (id) => cards.find((c) => c.id === id)?.name ?? "—";
  const accountName = (id) => accounts.find((a) => a.id === id)?.name ?? "—";
  const sourceName = (t) =>
    t.credit_card_id ? cardName(t.credit_card_id) : accountName(t.account_id);

  function mergeCategories(apiCats) {
    const names = new Set([...FALLBACK_CATEGORIES, ...apiCats.map((c) => c.name)]);
    return [...names].sort();
  }

  async function loadLookups() {
    try {
      const [p, c, a, r, cats, md] = await Promise.all([
        profilesApi.list(),
        creditCardsApi.list(),
        accountsApi.list(),
        cashbackRulesApi.listAll(),
        categoriesApi.list(),
        merchantCategoriesApi.list(),
      ]);
      setProfiles(p);
      setCards(c);
      setAccounts(a);
      setRules(r);
      setCategoryList(mergeCategories(cats));
      setMerchantDefaults(md);
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
      const name = window.prompt("New category name:");
      if (!name || !name.trim()) return;
      try {
        await categoriesApi.create(name.trim());
        const cats = await categoriesApi.list();
        setCategoryList(mergeCategories(cats));
        setCategory(name.trim());
      } catch (e) {
        setError(e.message);
      }
      return;
    }
    setCategory(value);
  }

  function onMerchantChange(value) {
    setField("merchant", value);
    // Auto-fill category from this merchant's remembered default.
    const def = merchantDefaults.find(
      (m) => m.merchant.toLowerCase() === value.trim().toLowerCase()
    );
    if (def) setCategory(def.category);
  }

  function startEdit(t) {
    setEditingId(t.id);
    setError(null);
    setForm({
      transaction_date: t.transaction_date,
      merchant: t.merchant ?? "",
      category: t.category ?? "",
      type: Number(t.amount) < 0 ? "purchase" : "refund",
      amount: String(Math.abs(Number(t.amount))),
      profile_id: t.profile_id,
      paymentSource: t.credit_card_id ? `card:${t.credit_card_id}` : `account:${t.account_id}`,
      cashbackPct: t.cashback_rate != null ? String(Number(t.cashback_rate) * 100) : "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.amount || !form.profile_id || !form.paymentSource) {
      setError("Amount, profile, and payment source are required.");
      return;
    }
    const isCard = form.paymentSource.startsWith("card:");
    const sourceId = form.paymentSource.split(":")[1];
    const magnitude = Math.abs(Number(form.amount));
    const amount = form.type === "purchase" ? -magnitude : magnitude;
    const rate = isCard && form.cashbackPct !== "" ? Number(form.cashbackPct) / 100 : null;
    const merchant = form.merchant.trim() || null;
    const payload = {
      transaction_date: form.transaction_date,
      merchant,
      category: form.category || null,
      amount,
      profile_id: form.profile_id,
      credit_card_id: isCard ? sourceId : null,
      account_id: isCard ? null : sourceId,
      cashback_rate: rate,
    };
    try {
      if (editingId) await transactionsApi.update(editingId, payload);
      else await transactionsApi.create(payload);
      // Remember this merchant's category for next time.
      if (merchant && form.category) {
        await merchantCategoriesApi.upsert(merchant, form.category);
        setMerchantDefaults(await merchantCategoriesApi.list());
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
          list="merchant-options"
          value={form.merchant}
          onChange={(e) => onMerchantChange(e.target.value)}
        />
        <datalist id="merchant-options">
          {merchantDefaults.map((m) => (
            <option key={m.merchant} value={m.merchant} />
          ))}
        </datalist>
        <select value={form.category} onChange={(e) => onCategorySelect(e.target.value)}>
          <option value="">Category…</option>
          {categoryList.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
          <option value={ADD_NEW}>➕ Add new category…</option>
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
        <select value={form.paymentSource} onChange={(e) => onSourceChange(e.target.value)}>
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
        </select>
        <input
          type="number"
          step="0.01"
          placeholder="Cashback %"
          value={form.cashbackPct}
          onChange={(e) => setField("cashbackPct", e.target.value)}
          disabled={!form.paymentSource.startsWith("card:")}
        />
        <button type="submit">{editingId ? "Save" : "Add"}</button>
        {editingId && (
          <button type="button" onClick={cancelEdit}>Cancel</button>
        )}
      </form>

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
              {profileName(t.profile_id)} · {sourceName(t)} · {money(t.amount)}
              {t.cashback_amount != null ? ` · CB ${money(t.cashback_amount)}` : ""} ·{" "}
              {t.is_paid_back ? "paid back" : "unpaid"}
            </small>
          </span>
          <span style={{ display: "flex", gap: 6 }}>
            <button onClick={() => startEdit(t)}>Edit</button>
            <button onClick={() => togglePaid(t)}>
              {t.is_paid_back ? "Mark unpaid" : "Mark paid"}
            </button>
            <button className="danger" onClick={() => handleDelete(t.id)}>Delete</button>
          </span>
        </div>
      ))}
    </div>
  );
}
