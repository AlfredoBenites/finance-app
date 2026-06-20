import { useEffect, useState } from "react";
import { bucketsApi, accountsApi, creditCardsApi } from "../api/client";
import { money } from "../format";

export default function BucketsPage() {
  const [buckets, setBuckets] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [cards, setCards] = useState([]);
  const [newName, setNewName] = useState("");
  const [newAccount, setNewAccount] = useState("");
  const [moves, setMoves] = useState({}); // accountId -> {from, to, amount}
  const [assign, setAssign] = useState({}); // bucketId -> accountId
  const [editNames, setEditNames] = useState({}); // bucketId -> name
  const [editMode, setEditMode] = useState(false);
  const [reimbursements, setReimbursements] = useState([]);
  const [error, setError] = useState(null);

  const cardName = (id) => cards.find((c) => c.id === id)?.name ?? "";
  const activeAccounts = accounts.filter((a) => a.is_active !== false);

  async function load() {
    try {
      const [b, a, c, r] = await Promise.all([
        bucketsApi.list(),
        accountsApi.list(),
        creditCardsApi.list(),
        bucketsApi.reimbursements(),
      ]);
      setBuckets(b);
      setAccounts(a);
      setCards(c);
      setReimbursements(r);
      setEditNames(Object.fromEntries(b.map((x) => [x.id, x.name])));
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const bucketsFor = (accountId) => buckets.filter((b) => b.account_id === accountId);
  const allocated = (accountId) =>
    bucketsFor(accountId).reduce((s, b) => s + Number(b.current_amount), 0);
  const unassigned = buckets.filter((b) => !b.account_id);

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim() || !newAccount) {
      setError("Bucket name and account are required.");
      return;
    }
    try {
      await bucketsApi.create({ name: newName.trim(), account_id: newAccount, current_amount: 0 });
      setNewName("");
      setError(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function doMove(accountId) {
    const m = moves[accountId] || {};
    if (!m.from || !m.to || !m.amount) {
      setError("Pick from, to, and an amount to move.");
      return;
    }
    try {
      await bucketsApi.transfer({ account_id: accountId, from: m.from, to: m.to, amount: Number(m.amount) });
      setMoves((s) => ({ ...s, [accountId]: { from: "", to: "", amount: "" } }));
      setError(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function renameBucket(id) {
    try {
      await bucketsApi.update(id, { name: (editNames[id] || "").trim() });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function reassignBucket(bucketId, accountId) {
    try {
      await bucketsApi.update(bucketId, { account_id: accountId });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function assignAccount(bucketId) {
    if (!assign[bucketId]) return;
    try {
      await bucketsApi.update(bucketId, { account_id: assign[bucketId] });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(id) {
    try {
      await bucketsApi.remove(id);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function allocate(cardId) {
    try {
      await bucketsApi.allocateReimbursement(cardId);
      setError(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  const setMove = (accountId, field, value) =>
    setMoves((s) => ({ ...s, [accountId]: { ...s[accountId], [field]: value } }));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Buckets</h1>
        <button onClick={() => setEditMode((v) => !v)}>
          {editMode ? "Done editing" : "Edit buckets"}
        </button>
      </div>
      <p><small>
        Buckets are envelopes inside a bank account. Each account's balance is the
        total; move money between buckets (you can't allocate more than the account has).
      </small></p>

      <form onSubmit={handleCreate}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New bucket name" />
        <select value={newAccount} onChange={(e) => setNewAccount(e.target.value)}>
          <option value="">In account…</option>
          {activeAccounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <button type="submit">Add bucket</button>
      </form>

      {error && <p style={{ color: "#dc2626" }}>Error: {error}</p>}

      {reimbursements.map((r) => (
        <div
          className="card"
          key={r.credit_card_id}
          style={{ borderColor: "#2563eb", borderWidth: 2, background: "#eff6ff" }}
        >
          <span>
            You've been reimbursed <strong>{money(r.amount)}</strong> for {r.card_name} charges
            — move it into <strong>{r.bucket_name}</strong> (from {r.account_name})?
          </span>
          <button onClick={() => allocate(r.credit_card_id)}>Allocate</button>
        </div>
      ))}

      {accounts.map((a) => {
        const accBuckets = bucketsFor(a.id);
        if (accBuckets.length === 0) return null;
        const alloc = allocated(a.id);
        const unalloc = Number(a.balance) - alloc;
        const m = moves[a.id] || {};
        const options = [{ id: "unallocated", name: "Unallocated" }, ...accBuckets];
        return (
          <div key={a.id} style={{ marginTop: 20 }}>
            <h2>{a.name}{a.is_active === false ? " (closed)" : ""}</h2>
            {!editMode && (
              <div className="card">
                <span>Balance {money(a.balance)} · allocated {money(alloc)}</span>
                <strong style={unalloc < 0 ? { color: "#dc2626" } : undefined}>
                  Unallocated {money(unalloc)}
                </strong>
              </div>
            )}
            {accBuckets.map((b) =>
              editMode ? (
                <div className="card" key={b.id}>
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      value={editNames[b.id] ?? ""}
                      onChange={(e) => setEditNames((s) => ({ ...s, [b.id]: e.target.value }))}
                    />
                    <button onClick={() => renameBucket(b.id)}>Rename</button>
                  </span>
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <select value={a.id} title="Move to account" onChange={(e) => reassignBucket(b.id, e.target.value)}>
                      {activeAccounts.concat(a.is_active === false ? [a] : []).map((acc) => (
                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                      ))}
                    </select>
                    <button className="danger" onClick={() => handleDelete(b.id)}>Delete</button>
                  </span>
                </div>
              ) : (
                <div className="card" key={b.id}>
                  <span>{b.name}{b.credit_card_id ? ` · 💳 ${cardName(b.credit_card_id)}` : ""}</span>
                  <strong>{money(b.current_amount)}</strong>
                </div>
              )
            )}
            {!editMode && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0 0 16px" }}>
                <small>Move</small>
                <select value={m.from || ""} onChange={(e) => setMove(a.id, "from", e.target.value)}>
                  <option value="">From…</option>
                  {options.filter((o) => o.id !== m.to).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <select value={m.to || ""} onChange={(e) => setMove(a.id, "to", e.target.value)}>
                  <option value="">To…</option>
                  {options.filter((o) => o.id !== m.from).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <input type="number" step="0.01" placeholder="$" style={{ width: 90 }}
                  value={m.amount || ""} onChange={(e) => setMove(a.id, "amount", e.target.value)} />
                <button onClick={() => doMove(a.id)}>Move</button>
              </div>
            )}
          </div>
        );
      })}

      {unassigned.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h2>Unassigned buckets</h2>
          <p><small>Assign each to the account where the money is kept.</small></p>
          {unassigned.map((b) => (
            <div className="card" key={b.id}>
              <span>
                {b.name}
                {b.credit_card_id ? ` · 💳 ${cardName(b.credit_card_id)}` : ""} · {money(b.current_amount)}
              </span>
              <span style={{ display: "flex", gap: 6 }}>
                <select value={assign[b.id] || ""} onChange={(e) => setAssign((s) => ({ ...s, [b.id]: e.target.value }))}>
                  <option value="">Account…</option>
                  {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button onClick={() => assignAccount(b.id)}>Assign</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
