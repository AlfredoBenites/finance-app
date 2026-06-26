import { useEffect, useState } from "react";
import { holdingsApi, accountsApi } from "../api/client";
import { money } from "../format";

const EMPTY = { account_id: "", symbol: "", kind: "stock", category: "", shares: "", manual_price: "" };

// shares can be fractional + crypto prices are tiny, so don't force 2 decimals
const price = (n) =>
  n == null ? "—" : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 6 })}`;

export default function InvestmentsPage() {
  const [holdings, setHoldings] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const accountName = (id) => accounts.find((a) => a.id === id)?.name ?? "—";
  const effPrice = (h) => (h.manual_price != null ? h.manual_price : h.last_price);
  const value = (h) => (effPrice(h) == null ? null : Number(h.shares) * Number(effPrice(h)));

  async function load() {
    try {
      const [h, a] = await Promise.all([holdingsApi.list(), accountsApi.list()]);
      setHoldings(h);
      setAccounts(a);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, []);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.account_id || !form.symbol.trim() || form.shares === "") {
      setError("Account, symbol, and shares are required.");
      return;
    }
    const payload = {
      account_id: form.account_id,
      symbol: form.symbol.trim().toUpperCase(),
      kind: form.kind,
      category: form.category.trim() || null,
      shares: Number(form.shares),
      manual_price: form.manual_price === "" ? null : Number(form.manual_price),
    };
    try {
      if (editingId) await holdingsApi.update(editingId, payload);
      else await holdingsApi.create(payload);
      setForm(EMPTY);
      setEditingId(null);
      setError(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  function startEdit(h) {
    setEditingId(h.id);
    setError(null);
    setForm({
      account_id: h.account_id,
      symbol: h.symbol,
      kind: h.kind,
      category: h.category ?? "",
      shares: String(h.shares),
      manual_price: h.manual_price != null ? String(h.manual_price) : "",
    });
  }

  async function handleDelete(id) {
    try {
      await holdingsApi.remove(id);
      if (editingId === id) { setEditingId(null); setForm(EMPTY); }
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function refresh() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await holdingsApi.refreshPrices();
      setError(r.updated < r.total ? `Updated ${r.updated} of ${r.total} (some symbols had no price — set a manual price).` : null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const total = holdings.reduce((s, h) => s + (value(h) || 0), 0);
  // group: account -> category -> holdings
  const grouped = {};
  for (const h of holdings) {
    const cat = h.category || "Uncategorized";
    grouped[h.account_id] = grouped[h.account_id] || {};
    (grouped[h.account_id][cat] = grouped[h.account_id][cat] || []).push(h);
  }
  const sum = (list) => list.reduce((s, h) => s + (value(h) || 0), 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Investments</h1>
        <button onClick={refresh} disabled={busy}>{busy ? "Refreshing…" : "Refresh prices"}</button>
      </div>
      <p><small>
        Enter your shares; prices come from Finnhub (stocks) and CoinGecko (crypto).
        An account's value becomes the sum of its holdings (overriding its manual balance),
        and that flows into net worth. Set a manual price to override anything not found.
      </small></p>

      <form onSubmit={handleSubmit} style={{ flexWrap: "wrap" }}>
        <select value={form.account_id} onChange={(e) => setField("account_id", e.target.value)}>
          <option value="">Account…</option>
          {accounts.filter((a) => a.is_active !== false).map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select value={form.kind} onChange={(e) => setField("kind", e.target.value)}>
          <option value="stock">Stock / ETF</option>
          <option value="crypto">Crypto</option>
        </select>
        <input placeholder="Symbol (AAPL, BTC)" value={form.symbol} onChange={(e) => setField("symbol", e.target.value)} />
        <input placeholder="Category (Roth IRA, Crypto…)" list="holding-categories" value={form.category} onChange={(e) => setField("category", e.target.value)} />
        <datalist id="holding-categories">
          {[...new Set(holdings.map((h) => h.category).filter(Boolean))].map((c) => <option key={c} value={c} />)}
        </datalist>
        <input type="number" step="any" placeholder="Shares" value={form.shares} onChange={(e) => setField("shares", e.target.value)} />
        <input type="number" step="any" placeholder="Manual price (optional)" value={form.manual_price} onChange={(e) => setField("manual_price", e.target.value)} />
        <button type="submit">{editingId ? "Save" : "Add holding"}</button>
        {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(EMPTY); }}>Cancel</button>}
      </form>

      {error && <p style={{ color: "#dc2626" }}>{error}</p>}

      <div className="card">
        <span><strong>Total investments</strong></span>
        <strong>{money(total)}</strong>
      </div>

      {holdings.length === 0 && <p>No holdings yet.</p>}

      {Object.entries(grouped).map(([accId, cats]) => {
        const accHoldings = Object.values(cats).flat();
        return (
          <div key={accId} style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid #2563eb" }}>
              <h2 style={{ margin: "0 0 4px" }}>{accountName(accId)}</h2>
              <strong>{money(sum(accHoldings))}</strong>
            </div>
            {Object.entries(cats).map(([cat, list]) => (
              <div key={cat}>
                <div style={{ display: "flex", justifyContent: "space-between", margin: "8px 0 2px", color: "#6b7280" }}>
                  <small><strong>{cat}</strong></small>
                  <small>{money(sum(list))}</small>
                </div>
                {list.map((h) => (
                  <div className="card" key={h.id}>
                    <span>
                      <strong>{h.symbol}</strong> · {h.kind} · {Number(h.shares)} shares
                      <br />
                      <small>
                        {h.manual_price != null ? "manual " : ""}price {price(effPrice(h))}
                        {h.last_price != null && h.manual_price == null && h.price_updated_at
                          ? ` · updated ${(h.price_updated_at || "").slice(0, 10)}` : ""}
                        {" · value "}<strong>{value(h) == null ? "—" : money(value(h))}</strong>
                      </small>
                    </span>
                    <span style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => startEdit(h)}>Edit</button>
                      <button className="danger" onClick={() => handleDelete(h.id)}>Delete</button>
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
