import { useEffect, useState } from "react";
import { accountsApi, bucketsApi } from "../api/client";
import { money } from "../format";

const ACCOUNT_TYPES = ["checking", "savings", "cash", "investment", "roth_ira"];

export default function AccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [buckets, setBuckets] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [name, setName] = useState("");
  const [type, setType] = useState(ACCOUNT_TYPES[0]);
  const [balance, setBalance] = useState("");
  const [isAsset, setIsAsset] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState({});
  const [xfer, setXfer] = useState({ from: "", to: "", amount: "", fromBucket: "unallocated", toBucket: "unallocated" });
  const [error, setError] = useState(null);

  async function load() {
    try {
      const [a, b, tr] = await Promise.all([accountsApi.list(), bucketsApi.list(), accountsApi.transfers()]);
      setAccounts(a);
      setBuckets(b);
      setTransfers(tr);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function doTransfer(e) {
    e.preventDefault();
    if (!xfer.from || !xfer.to || !xfer.amount) {
      setError("Pick both accounts and an amount to transfer.");
      return;
    }
    try {
      await accountsApi.transfer({
        from_account_id: xfer.from,
        to_account_id: xfer.to,
        amount: Number(xfer.amount),
        from_bucket_id: xfer.fromBucket || "unallocated",
        to_bucket_id: xfer.toBucket || "unallocated",
      });
      setXfer({ from: "", to: "", amount: "", fromBucket: "unallocated", toBucket: "unallocated" });
      setError(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await accountsApi.create({
        name: name.trim(),
        account_type: type,
        balance: balance === "" ? 0 : Number(balance),
        is_asset: isAsset,
      });
      setName("");
      setBalance("");
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  function startEdit(a) {
    setEditingId(a.id);
    setEdit({
      name: a.name,
      account_type: a.account_type ?? ACCOUNT_TYPES[0],
      balance: String(a.balance),
      is_asset: a.is_asset,
    });
  }

  async function saveEdit() {
    try {
      await accountsApi.update(editingId, {
        name: edit.name.trim(),
        account_type: edit.account_type,
        balance: Number(edit.balance),
        is_asset: edit.is_asset,
      });
      setEditingId(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(id) {
    try {
      await accountsApi.remove(id);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function setClosed(id, closed) {
    try {
      await accountsApi.update(id, { is_active: !closed });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function setShowInBuckets(id, val) {
    try {
      await accountsApi.update(id, { show_in_buckets: val });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  const activeAccounts = accounts.filter((a) => a.is_active !== false);
  const closedAccounts = accounts.filter((a) => a.is_active === false);

  return (
    <div>
      <h1>Accounts / Net Worth</h1>
      <p><small>Closed accounts are kept for history but don't count toward net worth.</small></p>

      <form onSubmit={handleAdd} style={{ flexWrap: "wrap" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Account name (e.g., Chase Checking)" />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="Balance $" />
        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={isAsset} onChange={(e) => setIsAsset(e.target.checked)} /> Asset
        </label>
        <button type="submit">Add</button>
      </form>

      <form onSubmit={doTransfer} style={{ flexWrap: "wrap", alignItems: "center" }}>
        <small>Transfer</small>
        <input type="number" step="0.01" style={{ width: 90 }} value={xfer.amount}
          onChange={(e) => setXfer((s) => ({ ...s, amount: e.target.value }))} placeholder="$" />
        <small>from</small>
        <select value={xfer.from} onChange={(e) => setXfer((s) => ({ ...s, from: e.target.value, fromBucket: "unallocated" }))}>
          <option value="">account…</option>
          {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={xfer.fromBucket} onChange={(e) => setXfer((s) => ({ ...s, fromBucket: e.target.value }))} title="Pull from this bucket (or unallocated)">
          <option value="unallocated">Unallocated</option>
          {buckets.filter((b) => b.account_id === xfer.from).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <small>to</small>
        <select value={xfer.to} onChange={(e) => setXfer((s) => ({ ...s, to: e.target.value, toBucket: "unallocated" }))}>
          <option value="">account…</option>
          {activeAccounts.filter((a) => a.id !== xfer.from).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={xfer.toBucket} onChange={(e) => setXfer((s) => ({ ...s, toBucket: e.target.value }))} title="Drop into this bucket (or unallocated)">
          <option value="unallocated">Unallocated</option>
          {buckets.filter((b) => b.account_id === xfer.to).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <button type="submit">Transfer</button>
      </form>

      {error && <p style={{ color: "#dc2626" }}>Error: {error}</p>}
      {accounts.length === 0 && <p>No accounts yet.</p>}

      {activeAccounts.map((a) =>
        editingId === a.id ? (
          <div className="card" key={a.id}>
            <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <input value={edit.name} onChange={(e) => setEdit((s) => ({ ...s, name: e.target.value }))} />
              <select value={edit.account_type} onChange={(e) => setEdit((s) => ({ ...s, account_type: e.target.value }))}>
                {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input type="number" step="0.01" style={{ width: 110 }} value={edit.balance}
                onChange={(e) => setEdit((s) => ({ ...s, balance: e.target.value }))} />
              <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="checkbox" checked={edit.is_asset} onChange={(e) => setEdit((s) => ({ ...s, is_asset: e.target.checked }))} /> Asset
              </label>
            </span>
            <span style={{ display: "flex", gap: 6 }}>
              <button onClick={saveEdit}>Save</button>
              <button onClick={() => setEditingId(null)}>Cancel</button>
            </span>
          </div>
        ) : (
          <div className="card" key={a.id}>
            <span>{a.name} · {a.account_type} · {money(a.balance)} · {a.is_asset ? "asset" : "liability"}</span>
            <span style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => setShowInBuckets(a.id, !a.show_in_buckets)}
                title="Show this account on the Buckets page so you can add buckets to it"
              >
                {a.show_in_buckets ? "Hide from Buckets" : "Show in Buckets"}
              </button>
              <button onClick={() => startEdit(a)}>Edit</button>
              <button onClick={() => setClosed(a.id, true)}>Close</button>
              <button className="danger" onClick={() => handleDelete(a.id)}>Delete</button>
            </span>
          </div>
        )
      )}

      {closedAccounts.length > 0 && (
        <>
          <h2>Closed accounts</h2>
          {closedAccounts.map((a) => (
            <div className="card" key={a.id}>
              <span><small>{a.name} · {a.account_type} · {money(a.balance)} (closed)</small></span>
              <button onClick={() => setClosed(a.id, false)}>Reopen</button>
            </div>
          ))}
        </>
      )}

      {transfers.length > 0 && (
        <>
          <h2>Transfer history</h2>
          {transfers.map((t) => (
            <div className="card" key={t.id}>
              <span><small>{(t.created_at || "").slice(0, 10)} · {t.summary}</small></span>
              <strong>{money(t.amount)}</strong>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
