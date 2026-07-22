import { useEffect, useState } from "react";
import { Info, RotateCcw } from "lucide-react";
import { creditCardsApi, accountsApi, bucketsApi, dashboardApi } from "../api/client";
import { money, formatDate, todayLocal } from "../format";
import { usePrivacy } from "../privacy/PrivacyContext";
import { useSettings } from "../settings/SettingsContext";
import { BucketIcon } from "../components/buckets/bucketIcons";
import StatementReconcile from "../components/payments/StatementReconcile";
import {
  PageHeader,
  Card,
  Button,
  Badge,
  Banner,
  Amount,
  Field,
  Select,
  AmountInput,
  DateInput,
  Table,
  THead,
  TH,
  TR,
  TD,
  cn,
} from "../components/ui";

const today = todayLocal;

// Match the dashboard's upcoming-payment badge (sooner = more urgent color).
const paymentTone = (days) => (days <= 2 ? "danger" : days <= 7 ? "orange" : "info");
const daysLabel = (days) =>
  days < 0 ? "Past due" : days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"}`;

export default function PaymentsPage() {
  const { hidden } = usePrivacy();
  const { paymentsPerPage, cardIconColors } = useSettings();
  const [cards, setCards] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [buckets, setBuckets] = useState([]);
  const [owedByCard, setOwedByCard] = useState({});
  const [statementByCard, setStatementByCard] = useState({});
  const [upcoming, setUpcoming] = useState([]);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);

  const [cardId, setCardId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [bucketId, setBucketId] = useState("");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(today());

  // History filters + pagination.
  const [filters, setFilters] = useState({ card: "", account: "", from: "", to: "" });
  const [page, setPage] = useState(0);

  // Manual "actual statement balance" override for the selected card (escape hatch).
  const [stmtInput, setStmtInput] = useState("");
  const [stmtBusy, setStmtBusy] = useState(false);

  async function setOverride(value) {
    if (!cardId || stmtBusy) return;
    setStmtBusy(true);
    try {
      await creditCardsApi.setStatementOverride(cardId, value);
      setStmtInput("");
      setError(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setStmtBusy(false);
    }
  }

  // Amounts inside native <option> labels can't use <Amount>, so mask by hand.
  const mask = (v) => (hidden ? "****" : money(v));

  async function load() {
    try {
      const [c, a, b, dash, hist] = await Promise.all([
        creditCardsApi.list(),
        accountsApi.list(),
        bucketsApi.list(),
        dashboardApi.get(),
        creditCardsApi.payments(),
      ]);
      setCards(c.filter((x) => x.is_active !== false));
      setAccounts(a);
      setBuckets(b);
      setOwedByCard(Object.fromEntries((dash.debt_by_card || []).map((d) => [d.credit_card_id, d.owed])));
      setStatementByCard(Object.fromEntries((dash.debt_by_card || []).map((d) => [d.credit_card_id, d.statement])));
      setUpcoming(dash.upcoming_payments || []);
      setHistory(hist);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function onCardChange(id) {
    setCardId(id);
    // Prefer the current statement balance (what's due to the bank); fall back
    // to total unpaid for cards without a statement closing day.
    const prefill = statementByCard[id] != null ? statementByCard[id] : owedByCard[id];
    setAmount(prefill != null ? String(prefill) : "");
  }

  async function handlePay(e) {
    e.preventDefault();
    if (!cardId || !accountId || !amount) {
      setError("Pick a card, an account, and an amount.");
      return;
    }
    try {
      await creditCardsApi.pay(cardId, {
        account_id: accountId,
        bucket_id: bucketId || null,
        amount: Number(amount),
        paid_on: paidOn || null,
      });
      setCardId("");
      setAccountId("");
      setBucketId("");
      setAmount("");
      setError(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  const accountBuckets = buckets.filter((b) => b.account_id === accountId);

  // "Due in" info comes from the dashboard's upcoming payments (keyed by card name).
  const dueByName = Object.fromEntries(upcoming.map((u) => [u.name, u]));
  // Closest due date first; cards with no upcoming due go last (by name).
  const sortedCards = [...cards].sort((a, b) => {
    const da = dueByName[a.name]?.days_until;
    const db = dueByName[b.name]?.days_until;
    if (da == null && db == null) return a.name.localeCompare(b.name);
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  });

  // Filter options come from what's actually in the history (may include closed cards).
  const historyCards = [...new Set(history.map((p) => p.card))].sort();
  const historyAccounts = [...new Set(history.map((p) => p.account))].sort();
  const filtered = history.filter((p) => {
    if (filters.card && p.card !== filters.card) return false;
    if (filters.account && p.account !== filters.account) return false;
    if (filters.from && (p.paid_on || "") < filters.from) return false;
    if (filters.to && (p.paid_on || "") > filters.to) return false;
    return true;
  });
  useEffect(() => {
    setPage(0);
  }, [filters, paymentsPerPage]);
  const pageSize = paymentsPerPage || 25;
  const total = filtered.length;
  const start = page * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);
  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  return (
    <div>
      <PageHeader
        title="Pay a card"
        subtitle="Settle a card by drawing money from an account (and optionally a bucket). The card's debt drops and the money leaves that account. Cards with a statement day prefill the amount due."
      />

      {/* Cards overview — click a row to select it for payment. */}
      {cards.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-ink mb-2">Cards</h2>
          <Table className="table-fixed sm:min-w-[34rem]">
            <THead>
              <tr>
                <TH className="w-[34%]">Card</TH>
                <TH className="hidden sm:table-cell w-[20%]">Due in</TH>
                <TH align="right" className="w-[23%]">Statement Due</TH>
                <TH align="right" className="hidden sm:table-cell w-[23%]">Total Balance</TH>
              </tr>
            </THead>
            <tbody>
              {sortedCards.map((c) => {
                const due = dueByName[c.name];
                return (
                  <TR
                    key={c.id}
                    onClick={() => onCardChange(c.id)}
                    className={cn("cursor-pointer", cardId === c.id && "bg-surface-muted")}
                  >
                    <TD className="text-ink">
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <BucketIcon icon="credit-card" color={cardIconColors[c.id]} />
                        <span className="truncate">{c.name}</span>
                        {cardId === c.id && <Badge tone="teal">Selected</Badge>}
                      </span>
                      {due && (
                        <span className="sm:hidden block mt-0.5">
                          <Badge tone={paymentTone(due.days_until)}>{daysLabel(due.days_until)}</Badge>
                        </span>
                      )}
                    </TD>
                    <TD className="hidden sm:table-cell">
                      {due ? <Badge tone={paymentTone(due.days_until)}>{daysLabel(due.days_until)}</Badge> : <span className="text-muted">—</span>}
                    </TD>
                    <TD align="right">
                      {statementByCard[c.id] != null ? <Amount value={statementByCard[c.id]} /> : <span className="text-muted">—</span>}
                    </TD>
                    <TD align="right" className="hidden sm:table-cell"><Amount value={owedByCard[c.id] || 0} /></TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}

      {/* Statement fixes for the selected card (issuers bill by posting date) */}
      {cardId && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-ink mb-1">Statement not matching?</h2>
          <p className="text-sm text-muted mb-2">
            The app estimates {cards.find((c) => c.id === cardId)?.name}'s statement from your transaction dates. Card issuers bill by posting date, so it can differ near the cycle's edge. Reconcile which charges belong to it (fixes this and next month), or pin the exact amount your issuer shows.
          </p>
          <StatementReconcile cardId={cardId} onApplied={load} onError={setError} />
          <div className="mt-3">
            <p className="text-xs text-muted mb-1">Or pin the exact statement your issuer shows (applies to this cycle, clears next cycle):</p>
            <div className="flex items-center gap-2 flex-wrap">
              <AmountInput
                className="w-40"
                value={stmtInput}
                onChange={setStmtInput}
                placeholder={statementByCard[cardId] != null ? mask(statementByCard[cardId]).replace("$", "") : "0.00"}
              />
              <Button size="sm" variant="primary" onClick={() => setOverride(Number(stmtInput))} disabled={stmtBusy || stmtInput === ""}>
                Set statement
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOverride(null)} disabled={stmtBusy}>
                Use estimate
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Pay form */}
      <h2 className="text-lg font-semibold text-ink mb-2">New payment</h2>
      <Card className="mb-6">
        <form onSubmit={handlePay} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Card">
            <Select value={cardId} onChange={(e) => onCardChange(e.target.value)}>
              <option value="">Card…</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="From Account">
            <Select value={accountId} onChange={(e) => { setAccountId(e.target.value); setBucketId(""); }}>
              <option value="">Account…</option>
              {accounts.filter((a) => a.is_active !== false).map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({mask(a.balance)})</option>
              ))}
            </Select>
          </Field>
          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-xs text-muted">
              From Bucket
              <span className="cursor-help" title="Optional; defaults to the account's unallocated money.">
                <Info size={12} />
              </span>
            </span>
            <Select value={bucketId} onChange={(e) => setBucketId(e.target.value)} disabled={!accountId}>
              <option value="">Unallocated</option>
              {accountBuckets.map((b) => (
                <option key={b.id} value={b.id}>{b.name} ({mask(b.current_amount)})</option>
              ))}
            </Select>
          </label>
          <Field label="Amount"><AmountInput value={amount} onChange={setAmount} /></Field>
          <Field label="Date Paid"><DateInput value={paidOn} onChange={setPaidOn} /></Field>
          <div className="flex items-end">
            <Button type="submit" variant="primary">Pay Card</Button>
          </div>
        </form>
      </Card>

      {error && <Banner tone="danger" className="mb-4">Error: {error}</Banner>}

      {/* Payment history */}
      <h2 className="text-lg font-semibold text-ink mb-2">Payment History</h2>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Select className="flex-1 min-w-[9rem]" value={filters.card} onChange={(e) => setFilter("card", e.target.value)}>
          <option value="">All cards</option>
          {historyCards.map((name) => <option key={name} value={name}>{name}</option>)}
        </Select>
        <Select value={filters.account} onChange={(e) => setFilter("account", e.target.value)}>
          <option value="">All accounts</option>
          {historyAccounts.map((name) => <option key={name} value={name}>{name}</option>)}
        </Select>
        <label className="flex items-center gap-1 text-sm text-muted">
          From
          <DateInput value={filters.from} onChange={(v) => setFilter("from", v)} />
        </label>
        <label className="flex items-center gap-1 text-sm text-muted">
          To
          <DateInput value={filters.to} onChange={(v) => setFilter("to", v)} />
        </label>
        {/* Keep the reset button as a plain inline item. Do NOT wrap it in a
            flex-1 / justify-center container: in this flex-wrap row that makes it
            center itself in the leftover space and, once the filters get wide
            enough to wrap, drift to the middle of a second row. The flex-1 on the
            first select above absorbs the slack so this sits at the right edge. */}
        <button
          type="button"
          onClick={() => setFilters({ card: "", account: "", from: "", to: "" })}
          title="Reset filters"
          aria-label="Reset filters"
          className="grid place-items-center h-9 w-9 rounded-md text-muted transition-colors hover:bg-accent hover:text-accent-ink active:brightness-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <RotateCcw size={16} />
        </button>
      </div>

      {total === 0 ? (
        <p className="text-muted text-sm">No payments match.</p>
      ) : (
        <>
          <Table className="table-fixed sm:min-w-[40rem]">
            <THead>
              <tr>
                <TH className="w-[16%]">Date</TH>
                <TH className="w-[28%]">Card</TH>
                <TH className="hidden sm:table-cell w-[38%]">From</TH>
                <TH align="right" className="w-[18%]">Amount</TH>
              </tr>
            </THead>
            <tbody>
              {pageItems.map((p) => (
                <TR key={p.id}>
                  <TD className="text-ink whitespace-nowrap">{p.paid_on ? formatDate(p.paid_on) : "—"}</TD>
                  <TD className="text-ink truncate">{p.card}</TD>
                  <TD className="hidden sm:table-cell text-muted truncate">
                    from {p.account}{p.bucket && p.bucket !== "—" ? ` / ${p.bucket}` : ""}
                  </TD>
                  <TD align="right"><strong className="text-ink"><Amount value={p.amount} /></strong></TD>
                </TR>
              ))}
            </tbody>
          </Table>

          {total > pageSize && (
            <div className="flex items-center justify-between gap-3 mt-3 text-sm">
              <span className="text-muted">
                {start + 1}–{Math.min(start + pageSize, total)} of {total}
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>Prev</Button>
                <Button size="sm" onClick={() => setPage((p) => p + 1)} disabled={start + pageSize >= total}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
