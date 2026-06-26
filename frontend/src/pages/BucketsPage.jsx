import { useEffect, useState } from "react";
import { bucketsApi, accountsApi, creditCardsApi } from "../api/client";
import { money } from "../format";

// How a bucket's money flows into net worth / real available money.
const KINDS = [
  { value: "spendable", label: "Mine · spendable", hint: "counts in net worth AND real available money" },
  { value: "set_aside", label: "Mine · set aside", hint: "counts in net worth, NOT in real available money" },
  { value: "not_mine", label: "Not mine (holding)", hint: "excluded from net worth AND real available money" },
];
const kindLabel = (k) => (KINDS.find((x) => x.value === k) || KINDS[1]).label;

export default function BucketsPage() {
  const [buckets, setBuckets] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [cards, setCards] = useState([]);
  const [newName, setNewName] = useState("");
  const [newAccount, setNewAccount] = useState("");
  const [newKind, setNewKind] = useState("set_aside");
  const [moves, setMoves] = useState({}); // accountId -> {from, to, amount}
  const [assign, setAssign] = useState({}); // bucketId -> accountId
  const [editNames, setEditNames] = useState({}); // bucketId -> name
  const [editMode, setEditMode] = useState(false);
  const [reimbursements, setReimbursements] = useState([]);
  const [allocSel, setAllocSel] = useState({}); // "profile:card" -> {source, dest}
  const [txnSel, setTxnSel] = useState({}); // "profile:card" -> {txnId: checked}
  const [incomeAllocs, setIncomeAllocs] = useState([]);
  const [incomeSel, setIncomeSel] = useState({}); // income_id -> bucket_id
  const [acctExpenses, setAcctExpenses] = useState([]);
  const [expenseSel, setExpenseSel] = useState({}); // transaction_id -> bucket_id
  const [moveHistory, setMoveHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const cardName = (id) => cards.find((c) => c.id === id)?.name ?? "";
  const activeAccounts = accounts.filter((a) => a.is_active !== false);

  async function load() {
    try {
      const [b, a, c, r, inc, mv, exp] = await Promise.all([
        bucketsApi.list(),
        accountsApi.list(),
        creditCardsApi.list(),
        bucketsApi.reimbursements(),
        bucketsApi.incomeAllocations(),
        bucketsApi.moves(),
        bucketsApi.accountExpenses(),
      ]);
      setBuckets(b);
      setAccounts(a);
      setCards(c);
      setMoveHistory(mv);
      setAcctExpenses(exp);
      setReimbursements(r);
      // default every charge to selected
      setTxnSel(Object.fromEntries(r.map((x) => [
        `${x.profile_id}:${x.credit_card_id}`,
        Object.fromEntries((x.transactions || []).map((t) => [t.id, true])),
      ])));
      setIncomeAllocs(inc);
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
      await bucketsApi.create({ name: newName.trim(), account_id: newAccount, current_amount: 0, kind: newKind });
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

  async function changeKind(bucketId, kind) {
    try {
      await bucketsApi.update(bucketId, { kind });
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

  async function dismiss(r) {
    if (busy) return;
    setBusy(true);
    try {
      await bucketsApi.dismissReimbursement({ profile_id: r.profile_id, credit_card_id: r.credit_card_id });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function dismissAll() {
    if (busy) return;
    setBusy(true);
    try {
      await bucketsApi.dismissAllReimbursements();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function allocateIncome(r) {
    const bucketId = incomeSel[r.income_id];
    if (!bucketId) {
      setError("Pick a bucket for this income.");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      await bucketsApi.allocateIncome({ income_id: r.income_id, bucket_id: bucketId });
      setError(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function dismissIncome(r) {
    if (busy) return;
    setBusy(true);
    try {
      await bucketsApi.dismissIncome({ income_id: r.income_id });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function dismissAllIncome() {
    if (busy) return;
    setBusy(true);
    try {
      await bucketsApi.dismissAllIncome();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function deductExpense(r) {
    const bucketId = expenseSel[r.transaction_id];
    if (!bucketId) {
      setError("Pick where to subtract this expense from.");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      await bucketsApi.deductExpense({ transaction_id: r.transaction_id, bucket_id: bucketId });
      setError(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function dismissExpense(r) {
    if (busy) return;
    setBusy(true);
    try {
      await bucketsApi.dismissExpense({ transaction_id: r.transaction_id });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function dismissAllExpenses() {
    if (busy) return;
    setBusy(true);
    try {
      await bucketsApi.dismissAllExpenses();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function allocate(r, sel, transactionIds) {
    if (!sel.source || !sel.dest) {
      setError("Pick a source and destination bucket.");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      await bucketsApi.allocateReimbursement({
        profile_id: r.profile_id,
        credit_card_id: r.credit_card_id,
        source_bucket_id: sel.source,
        dest_bucket_id: sel.dest,
        transaction_ids: transactionIds,
      });
      setError(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
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
        <select value={newKind} onChange={(e) => setNewKind(e.target.value)} title={KINDS.find((k) => k.value === newKind)?.hint}>
          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
        <button type="submit">Add bucket</button>
      </form>

      {error && <p style={{ color: "#dc2626" }}>Error: {error}</p>}

      {incomeAllocs.length > 0 && (
        <div style={{ textAlign: "right", marginBottom: 4 }}>
          <button onClick={dismissAllIncome} disabled={busy}>
            {busy ? "Working…" : "Dismiss all income"}
          </button>
        </div>
      )}
      {incomeAllocs.map((r) => {
        const accountBuckets = buckets.filter((b) => b.account_id === r.account_id);
        return (
          <div className="card" key={r.income_id} style={{ borderColor: "#16a34a", borderWidth: 2, background: "#f0fdf4", flexWrap: "wrap" }}>
            <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              Put <strong>{money(r.amount)}</strong> ({r.source}, into {r.account_name}) in bucket
              <select value={incomeSel[r.income_id] || ""} onChange={(e) => setIncomeSel((s) => ({ ...s, [r.income_id]: e.target.value }))}>
                <option value="">bucket…</option>
                <option value="unallocated">Unallocated (just the balance)</option>
                {accountBuckets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </span>
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button onClick={() => allocateIncome(r)} disabled={busy}>Allocate</button>
              <button onClick={() => dismissIncome(r)} disabled={busy} title="Decline this suggestion">✕</button>
            </span>
          </div>
        );
      })}

      {acctExpenses.length > 0 && (
        <div style={{ textAlign: "right", marginBottom: 4 }}>
          <button onClick={dismissAllExpenses} disabled={busy}>
            {busy ? "Working…" : "Dismiss all expenses"}
          </button>
        </div>
      )}
      {acctExpenses.map((r) => {
        const accountBuckets = buckets.filter((b) => b.account_id === r.account_id);
        const isPurchase = Number(r.amount) < 0;
        return (
          <div className="card" key={r.transaction_id} style={{ borderColor: "#d97706", borderWidth: 2, background: "#fff7ed", flexWrap: "wrap" }}>
            <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {isPurchase ? "Subtract" : "Add"} <strong>{money(Math.abs(Number(r.amount)))}</strong> ({r.merchant || "—"}, from {r.account_name}) {isPurchase ? "from" : "to"}
              <select value={expenseSel[r.transaction_id] || ""} onChange={(e) => setExpenseSel((s) => ({ ...s, [r.transaction_id]: e.target.value }))}>
                <option value="">bucket…</option>
                <option value="unallocated">Unallocated (just the balance)</option>
                {accountBuckets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </span>
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button onClick={() => deductExpense(r)} disabled={busy}>Apply</button>
              <button onClick={() => dismissExpense(r)} disabled={busy} title="Decline this suggestion">✕</button>
            </span>
          </div>
        );
      })}

      {reimbursements.length > 0 && (
        <div style={{ textAlign: "right", marginBottom: 4 }}>
          <button onClick={dismissAll} disabled={busy}>
            {busy ? "Working…" : "Dismiss all suggestions"}
          </button>
        </div>
      )}
      {reimbursements.map((r) => {
        const key = `${r.profile_id}:${r.credit_card_id}`;
        const sel = allocSel[key] || { source: r.source_bucket_id || "", dest: r.dest_bucket_id || "" };
        const setSel = (field, value) => setAllocSel((s) => ({ ...s, [key]: { ...sel, [field]: value } }));
        const lines = r.transactions || [];
        const picked = txnSel[key] || {};
        const chosen = lines.filter((t) => picked[t.id]);
        const selAmount = chosen.reduce((s, t) => s - Number(t.amount), 0);
        const toggleTxn = (id) => setTxnSel((s) => ({ ...s, [key]: { ...s[key], [id]: !s[key]?.[id] } }));
        return (
          <div className="card" key={key} style={{ borderColor: "#2563eb", borderWidth: 2, background: "#eff6ff", flexWrap: "wrap" }}>
            <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {r.own ? "Set aside" : "Move"} <strong>{money(selAmount)}</strong> ({r.profile_name}'s {r.card_name}) from
              <select value={sel.source} onChange={(e) => setSel("source", e.target.value)}>
                <option value="">bucket…</option>
                {buckets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              to
              <select value={sel.dest} onChange={(e) => setSel("dest", e.target.value)}>
                <option value="">bucket…</option>
                {buckets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </span>
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button onClick={() => allocate(r, sel, chosen.map((t) => t.id))} disabled={busy || chosen.length === 0}>Allocate</button>
              <button onClick={() => dismiss(r)} disabled={busy} title="Decline this suggestion">✕</button>
            </span>
            {lines.length > 0 && (
              <details style={{ flexBasis: "100%", marginTop: 6 }}>
                <summary style={{ cursor: "pointer", fontSize: 13, color: "#1e3a8a" }}>
                  {chosen.length} of {lines.length} transaction{lines.length === 1 ? "" : "s"} selected
                </summary>
                <ul style={{ margin: "6px 0 0", paddingLeft: 4, fontSize: 13, listStyle: "none" }}>
                  {lines.map((t) => (
                    <li key={t.id}>
                      <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input type="checkbox" checked={!!picked[t.id]} onChange={() => toggleTxn(t.id)} />
                        {t.transaction_date} · {t.merchant || "—"} · <strong>{money(-t.amount)}</strong>
                        {t.notes ? ` · ${t.notes}` : ""}
                      </label>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        );
      })}

      {accounts.map((a) => {
        const accBuckets = bucketsFor(a.id);
        if (accBuckets.length === 0) return null;
        const alloc = allocated(a.id);
        const unalloc = Math.round((Number(a.balance) - alloc) * 100) / 100;
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
                    {!b.credit_card_id && (
                      <select value={b.kind || "set_aside"} title={KINDS.find((k) => k.value === (b.kind || "set_aside"))?.hint}
                        onChange={(e) => changeKind(b.id, e.target.value)}>
                        {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                      </select>
                    )}
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
                  <span>
                    {b.name}
                    {b.credit_card_id
                      ? ` · 💳 ${cardName(b.credit_card_id)}`
                      : b.kind && b.kind !== "set_aside" ? ` · ${kindLabel(b.kind)}` : ""}
                  </span>
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

      {moveHistory.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h2>Move history</h2>
          {moveHistory.map((m) => (
            <div className="card" key={m.id}>
              <span><small>{(m.created_at || "").slice(0, 10)} · {m.summary}</small></span>
              <strong>{money(m.amount)}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
