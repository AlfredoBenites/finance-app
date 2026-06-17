import { useEffect, useState } from "react";
import { accountsApi } from "../api/client";

const ACCOUNT_TYPES = ["checking", "savings", "cash", "investment", "roth_ira"];
const money = (n) => `$${Number(n).toFixed(2)}`;

export default function AccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [name, setName] = useState("");
  const [type, setType] = useState(ACCOUNT_TYPES[0]);
  const [balance, setBalance] = useState("");
  const [isAsset, setIsAsset] = useState(true);
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
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Account name (e.g., Chase Checking)"
        />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input
          type="number"
          step="0.01"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          placeholder="Balance $"
        />
        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="checkbox"
            checked={isAsset}
            onChange={(e) => setIsAsset(e.target.checked)}
          />
          Asset
        </label>
        <button type="submit">Add</button>
      </form>

      {error && <p style={{ color: "#dc2626" }}>Error: {error}</p>}
      {accounts.length === 0 && <p>No accounts yet.</p>}

      {accounts.map((a) => (
        <div className="card" key={a.id}>
          <span>
            {a.name} · {a.account_type} · {money(a.balance)} ·{" "}
            {a.is_asset ? "asset" : "liability"}
          </span>
          <button className="danger" onClick={() => handleDelete(a.id)}>
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
