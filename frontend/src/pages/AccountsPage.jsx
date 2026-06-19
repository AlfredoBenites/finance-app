import { useEffect, useState } from "react";
import { accountsApi } from "../api/client";
import { money } from "../format";

const ACCOUNT_TYPES = ["checking", "savings", "cash", "investment", "roth_ira"];

export default function AccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [name, setName] = useState("");
  const [type, setType] = useState(ACCOUNT_TYPES[0]);
  const [balance, setBalance] = useState("");
  const [isAsset, setIsAsset] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState({});
  const [error, setError] = useState(null);

  async function load() {
    try {
      setAccounts(await accountsApi.list());
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

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

  return (
    <div>
      <h1>Accounts / Net Worth</h1>

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

      {error && <p style={{ color: "#dc2626" }}>Error: {error}</p>}
      {accounts.length === 0 && <p>No accounts yet.</p>}

      {accounts.map((a) =>
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
              <button onClick={() => startEdit(a)}>Edit</button>
              <button className="danger" onClick={() => handleDelete(a.id)}>Delete</button>
            </span>
          </div>
        )
      )}
    </div>
  );
}
