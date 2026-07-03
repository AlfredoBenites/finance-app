import { useEffect, useState } from "react";
import { bucketsApi, accountsApi, creditCardsApi } from "../api/client";
import { useSettings } from "../settings/SettingsContext";
import { formatDate } from "../format";
import {
  PageHeader,
  Card,
  Button,
  Badge,
  Banner,
  Amount,
  Select,
  Input,
  Table,
  THead,
  TH,
  TR,
  TD,
} from "../components/ui";

// How a bucket's money flows into net worth / real available money.
const KINDS = [
  { value: "spendable", label: "Mine · spendable", hint: "counts in net worth AND real available money" },
  { value: "set_aside", label: "Mine · set aside", hint: "counts in net worth, NOT in real available money" },
  { value: "not_mine", label: "Not mine (holding)", hint: "excluded from net worth AND real available money" },
];
const kindLabel = (k) => (KINDS.find((x) => x.value === k) || KINDS[1]).label;

// Order an array of {id} by a saved list of ids; anything not listed goes last.
function applyOrder(items, order) {
  const set = new Set(order || []);
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  const inOrder = (order || []).map((id) => byId[id]).filter(Boolean);
  const rest = items.filter((i) => !set.has(i.id));
  return [...inOrder, ...rest];
}

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
  // Move-history filters + pagination.
  const [histBucket, setHistBucket] = useState(""); // bucket id to filter by (matched by name in the summary)
  const [histMinAmount, setHistMinAmount] = useState("");
  const [histPage, setHistPage] = useState(0);

  const { accountOrder, bucketOrder, moveHistoryPerPage } = useSettings();

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

  useEffect(() => {
    setHistPage(0);
  }, [histBucket, histMinAmount, moveHistoryPerPage]);

  const bucketsFor = (accountId) => applyOrder(buckets.filter((b) => b.account_id === accountId), bucketOrder[accountId]);
  const allocated = (accountId) =>
    bucketsFor(accountId).reduce((s, b) => s + Number(b.current_amount), 0);
  const unassigned = buckets.filter((b) => !b.account_id);
  const orderedAccounts = applyOrder(accounts, accountOrder);

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

  // Move-history filtering (by bucket name in the summary + minimum amount) and pagination.
  const bucketNameById = (id) => buckets.find((b) => b.id === id)?.name || "";
  const filteredMoves = moveHistory.filter((m) => {
    if (histBucket) {
      const name = bucketNameById(histBucket).toLowerCase();
      if (name && !(m.summary || "").toLowerCase().includes(name)) return false;
    }
    if (histMinAmount && Math.abs(Number(m.amount)) < Number(histMinAmount)) return false;
    return true;
  });
  const histPageSize = moveHistoryPerPage || 25;
  const histTotal = filteredMoves.length;
  const histStart = histPage * histPageSize;
  const histPageItems = filteredMoves.slice(histStart, histStart + histPageSize);

  return (
    <div>
      <PageHeader
        title="Buckets"
        subtitle="Envelopes inside a bank account. Each account's balance is the total; move money between buckets (you can't allocate more than the account has)."
        actions={
          <Button variant={editMode ? "primary" : "secondary"} onClick={() => setEditMode((v) => !v)}>
            {editMode ? "Done editing" : "Edit buckets"}
          </Button>
        }
      />

      {/* Add bucket */}
      <Card className="mb-6">
        <form onSubmit={handleCreate} className="flex items-end gap-2 flex-wrap">
          <label className="flex flex-col gap-1 flex-1 min-w-[12rem]">
            <span className="text-xs text-muted">Bucket name</span>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New bucket name" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Account</span>
            <Select value={newAccount} onChange={(e) => setNewAccount(e.target.value)}>
              <option value="">In account…</option>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Kind</span>
            <Select value={newKind} onChange={(e) => setNewKind(e.target.value)} title={KINDS.find((k) => k.value === newKind)?.hint}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </Select>
          </label>
          <Button type="submit" variant="primary">Add bucket</Button>
        </form>
      </Card>

      {error && <Banner tone="danger" className="mb-4">Error: {error}</Banner>}

      {/* Income → bucket suggestions */}
      {incomeAllocs.length > 0 && (
        <section className="mb-6 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Income to allocate</h2>
            <Button size="sm" onClick={dismissAllIncome} disabled={busy}>
              {busy ? "Working…" : "Dismiss all"}
            </Button>
          </div>
          {incomeAllocs.map((r) => {
            const accountBuckets = bucketsFor(r.account_id);
            return (
              <Banner tone="success" key={r.income_id}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    Put <strong><Amount value={r.amount} /></strong> ({r.source}, into {r.account_name}) in bucket
                    <Select value={incomeSel[r.income_id] || ""} onChange={(e) => setIncomeSel((s) => ({ ...s, [r.income_id]: e.target.value }))}>
                      <option value="">bucket…</option>
                      <option value="unallocated">Unallocated (just the balance)</option>
                      {accountBuckets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="green" onClick={() => allocateIncome(r)} disabled={busy}>Allocate</Button>
                    <Button size="sm" variant="ghost" onClick={() => dismissIncome(r)} disabled={busy} title="Decline this suggestion">✕</Button>
                  </div>
                </div>
              </Banner>
            );
          })}
        </section>
      )}

      {/* Bank/cash expense → bucket suggestions */}
      {acctExpenses.length > 0 && (
        <section className="mb-6 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Account expenses to apply</h2>
            <Button size="sm" onClick={dismissAllExpenses} disabled={busy}>
              {busy ? "Working…" : "Dismiss all"}
            </Button>
          </div>
          {acctExpenses.map((r) => {
            const accountBuckets = bucketsFor(r.account_id);
            const isPurchase = Number(r.amount) < 0;
            return (
              <Banner tone="orange" key={r.transaction_id}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isPurchase ? "Subtract" : "Add"} <strong><Amount value={Math.abs(Number(r.amount))} /></strong> ({r.merchant || "—"}, from {r.account_name}) {isPurchase ? "from" : "to"}
                    <Select value={expenseSel[r.transaction_id] || ""} onChange={(e) => setExpenseSel((s) => ({ ...s, [r.transaction_id]: e.target.value }))}>
                      <option value="">bucket…</option>
                      <option value="unallocated">Unallocated (just the balance)</option>
                      {accountBuckets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="primary" onClick={() => deductExpense(r)} disabled={busy}>Apply</Button>
                    <Button size="sm" variant="ghost" onClick={() => dismissExpense(r)} disabled={busy} title="Decline this suggestion">✕</Button>
                  </div>
                </div>
              </Banner>
            );
          })}
        </section>
      )}

      {/* Reimbursement / set-aside suggestions */}
      {reimbursements.length > 0 && (
        <section className="mb-6 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Reimbursement suggestions</h2>
            <Button size="sm" onClick={dismissAll} disabled={busy}>
              {busy ? "Working…" : "Dismiss all"}
            </Button>
          </div>
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
              <Banner tone="info" key={key}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.own ? "Set aside" : "Move"} <strong><Amount value={selAmount} /></strong> ({r.profile_name}'s {r.card_name}) from
                    <Select value={sel.source} onChange={(e) => setSel("source", e.target.value)}>
                      <option value="">bucket…</option>
                      {buckets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                    to
                    <Select value={sel.dest} onChange={(e) => setSel("dest", e.target.value)}>
                      <option value="">bucket…</option>
                      {buckets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="primary" onClick={() => allocate(r, sel, chosen.map((t) => t.id))} disabled={busy || chosen.length === 0}>Allocate</Button>
                    <Button size="sm" variant="ghost" onClick={() => dismiss(r)} disabled={busy} title="Decline this suggestion">✕</Button>
                  </div>
                </div>
                {lines.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-info">
                      {chosen.length} of {lines.length} transaction{lines.length === 1 ? "" : "s"} selected
                    </summary>
                    <ul className="mt-1.5 space-y-1 text-xs">
                      {lines.map((t) => (
                        <li key={t.id}>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" className="h-4 w-4 accent-green" checked={!!picked[t.id]} onChange={() => toggleTxn(t.id)} />
                            <span className="text-ink">{t.transaction_date} · {t.merchant || "—"} · <strong><Amount value={-t.amount} /></strong>{t.notes ? ` · ${t.notes}` : ""}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </Banner>
            );
          })}
        </section>
      )}

      {/* Accounts and their buckets — two per row on wider screens. */}
      <div className="grid md:grid-cols-2 gap-x-5 gap-y-6 mb-6 items-start">
        {orderedAccounts.map((a) => {
          const accBuckets = bucketsFor(a.id);
          if (accBuckets.length === 0) return null;
          const alloc = allocated(a.id);
          const unalloc = Math.round((Number(a.balance) - alloc) * 100) / 100;
          const m = moves[a.id] || {};
          const options = [{ id: "unallocated", name: "Unallocated" }, ...accBuckets];
          return (
            <section key={a.id}>
              <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
                <h2 className="text-lg font-semibold text-ink">
                  {a.name}{a.is_active === false ? " (closed)" : ""}
                </h2>
                {!editMode && (
                  <div className="text-sm text-muted">
                    Bal <Amount value={a.balance} /> · alloc <Amount value={alloc} /> ·{" "}
                    <span className={unalloc < 0 ? "text-danger" : "text-ink"}>
                      Unalloc <Amount value={unalloc} tone={unalloc < 0 ? "danger" : "default"} />
                    </span>
                  </div>
                )}
              </div>

              {editMode ? (
                <Card padded={false} className="divide-y divide-border">
                  {accBuckets.map((b) => (
                    <div className="flex items-center gap-2 px-4 py-2.5 flex-wrap" key={b.id}>
                      <Input
                        value={editNames[b.id] ?? ""}
                        onChange={(e) => setEditNames((s) => ({ ...s, [b.id]: e.target.value }))}
                        className="flex-1 min-w-[9rem]"
                      />
                      <Button size="sm" onClick={() => renameBucket(b.id)}>Rename</Button>
                      {!b.credit_card_id && (
                        <Select
                          value={b.kind || "set_aside"}
                          title={KINDS.find((k) => k.value === (b.kind || "set_aside"))?.hint}
                          onChange={(e) => changeKind(b.id, e.target.value)}
                        >
                          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                        </Select>
                      )}
                      <Select value={a.id} title="Move to account" onChange={(e) => reassignBucket(b.id, e.target.value)}>
                        {activeAccounts.concat(a.is_active === false ? [a] : []).map((acc) => (
                          <option key={acc.id} value={acc.id}>{acc.name}</option>
                        ))}
                      </Select>
                      <Button size="sm" variant="danger" onClick={() => handleDelete(b.id)}>Delete</Button>
                    </div>
                  ))}
                </Card>
              ) : (
                <Table>
                  <THead>
                    <tr>
                      <TH>Bucket</TH>
                      <TH align="right">Amount</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {accBuckets.map((b) => (
                      <TR key={b.id}>
                        <TD>
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="text-ink truncate">{b.name}</span>
                            {b.credit_card_id ? (
                              <Badge tone="neutral">💳 {cardName(b.credit_card_id)}</Badge>
                            ) : b.kind && b.kind !== "set_aside" ? (
                              <Badge tone="neutral">{kindLabel(b.kind)}</Badge>
                            ) : null}
                          </span>
                        </TD>
                        <TD align="right">
                          <strong className="text-ink"><Amount value={b.current_amount} /></strong>
                        </TD>
                      </TR>
                    ))}
                    <tr className="border-t border-border">
                      <TD className="text-xs text-muted">Unallocated</TD>
                      <TD align="right">
                        <Amount value={unalloc} tone={unalloc < 0 ? "danger" : "muted"} />
                      </TD>
                    </tr>
                  </tbody>
                </Table>
              )}

              {!editMode && (
                <div className="flex items-center gap-2 flex-wrap mt-2 pl-1">
                  <span className="text-xs text-muted">Move</span>
                  <Select value={m.from || ""} onChange={(e) => setMove(a.id, "from", e.target.value)}>
                    <option value="">From…</option>
                    {options.filter((o) => o.id !== m.to).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </Select>
                  <Select value={m.to || ""} onChange={(e) => setMove(a.id, "to", e.target.value)}>
                    <option value="">To…</option>
                    {options.filter((o) => o.id !== m.from).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </Select>
                  <Input type="number" step="0.01" placeholder="$" className="w-24"
                    value={m.amount || ""} onChange={(e) => setMove(a.id, "amount", e.target.value)} />
                  <Button size="sm" onClick={() => doMove(a.id)}>Move</Button>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Buckets not yet assigned to an account */}
      {unassigned.length > 0 && (
        <section className="mb-6">
          <h2 className="text-lg font-semibold text-ink mb-1">Unassigned buckets</h2>
          <p className="text-sm text-muted mb-2">Assign each to the account where the money is kept.</p>
          <Card padded={false} className="divide-y divide-border">
            {unassigned.map((b) => (
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 flex-wrap" key={b.id}>
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-ink truncate">{b.name}</span>
                  {b.credit_card_id && <Badge tone="neutral">💳 {cardName(b.credit_card_id)}</Badge>}
                  <span className="text-muted"><Amount value={b.current_amount} /></span>
                </span>
                <span className="flex items-center gap-2">
                  <Select value={assign[b.id] || ""} onChange={(e) => setAssign((s) => ({ ...s, [b.id]: e.target.value }))}>
                    <option value="">Account…</option>
                    {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </Select>
                  <Button size="sm" onClick={() => assignAccount(b.id)}>Assign</Button>
                </span>
              </div>
            ))}
          </Card>
        </section>
      )}

      {/* Move history */}
      {moveHistory.length > 0 && (
        <section className="mb-6">
          <h2 className="text-lg font-semibold text-ink mb-2">Move history</h2>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Select value={histBucket} onChange={(e) => setHistBucket(e.target.value)}>
              <option value="">All buckets</option>
              {buckets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="Min $"
              className="w-28"
              value={histMinAmount}
              onChange={(e) => setHistMinAmount(e.target.value)}
            />
          </div>

          {histTotal === 0 ? (
            <p className="text-muted text-sm">No moves match.</p>
          ) : (
            <>
              <Table className="table-fixed min-w-[32rem]">
                <THead>
                  <tr>
                    <TH className="w-[22%]">Date</TH>
                    <TH className="w-[58%]">Summary</TH>
                    <TH align="right" className="w-[20%]">Amount</TH>
                  </tr>
                </THead>
                <tbody>
                  {histPageItems.map((m) => (
                    <TR key={m.id}>
                      <TD className="text-ink whitespace-nowrap">{formatDate(m.created_at)}</TD>
                      <TD className="text-muted"><span className="block truncate" title={m.summary}>{m.summary}</span></TD>
                      <TD align="right"><strong className="text-ink"><Amount value={m.amount} /></strong></TD>
                    </TR>
                  ))}
                </tbody>
              </Table>

              {histTotal > histPageSize && (
                <div className="flex items-center justify-between gap-3 mt-3 text-sm">
                  <span className="text-muted">
                    {histStart + 1}–{Math.min(histStart + histPageSize, histTotal)} of {histTotal}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => setHistPage((p) => p - 1)} disabled={histPage === 0}>Prev</Button>
                    <Button size="sm" onClick={() => setHistPage((p) => p + 1)} disabled={histStart + histPageSize >= histTotal}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
