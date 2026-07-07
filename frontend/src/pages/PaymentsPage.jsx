import { useEffect, useState } from "react";
import { creditCardsApi, accountsApi, bucketsApi, dashboardApi } from "../api/client";
import { money, formatDate, todayLocal } from "../format";
import { usePrivacy } from "../privacy/PrivacyContext";
import {
  PageHeader,
  Card,
  Button,
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
} from "../components/ui";

const today = todayLocal;

export default function PaymentsPage() {
  const { hidden } = usePrivacy();
  const [cards, setCards] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [buckets, setBuckets] = useState([]);
  const [owedByCard, setOwedByCard] = useState({});
  const [statementByCard, setStatementByCard] = useState({});
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);

  const [cardId, setCardId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [bucketId, setBucketId] = useState("");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(today());

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

  return (
    <div>
      <PageHeader
        title="Pay a card"
        subtitle="Settle a card by drawing money from an account (and optionally a bucket). The card's debt drops and the money leaves that account. Cards with a statement day prefill the amount due."
      />

      {/* Pay form */}
      <Card className="mb-6">
        <form onSubmit={handlePay} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Card">
            <Select value={cardId} onChange={(e) => onCardChange(e.target.value)}>
              <option value="">Card…</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {statementByCard[c.id] != null
                    ? ` — statement ${mask(statementByCard[c.id])}`
                    : owedByCard[c.id]
                      ? ` — owes ${mask(owedByCard[c.id])}`
                      : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From account">
            <Select value={accountId} onChange={(e) => { setAccountId(e.target.value); setBucketId(""); }}>
              <option value="">Account…</option>
              {accounts.filter((a) => a.is_active !== false).map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({mask(a.balance)})</option>
              ))}
            </Select>
          </Field>
          <Field label="From bucket" hint="Optional; defaults to the account's unallocated money">
            <Select value={bucketId} onChange={(e) => setBucketId(e.target.value)} disabled={!accountId}>
              <option value="">Unallocated</option>
              {accountBuckets.map((b) => (
                <option key={b.id} value={b.id}>{b.name} ({mask(b.current_amount)})</option>
              ))}
            </Select>
          </Field>
          <Field label="Amount"><AmountInput value={amount} onChange={setAmount} /></Field>
          <Field label="Date paid"><DateInput value={paidOn} onChange={setPaidOn} /></Field>
          <div className="flex items-end">
            <Button type="submit" variant="primary">Pay card</Button>
          </div>
        </form>
      </Card>

      {error && <Banner tone="danger" className="mb-4">Error: {error}</Banner>}

      {/* Payment history */}
      <h2 className="text-lg font-semibold text-ink mb-2">Payment history</h2>
      {history.length === 0 ? (
        <p className="text-muted text-sm">No payments yet.</p>
      ) : (
        <Table className="table-fixed min-w-[40rem]">
          <THead>
            <tr>
              <TH className="w-[16%]">Date</TH>
              <TH className="w-[28%]">Card</TH>
              <TH className="w-[38%]">From</TH>
              <TH align="right" className="w-[18%]">Amount</TH>
            </tr>
          </THead>
          <tbody>
            {history.map((p) => (
              <TR key={p.id}>
                <TD className="text-ink whitespace-nowrap">{p.paid_on ? formatDate(p.paid_on) : "—"}</TD>
                <TD className="text-ink truncate">{p.card}</TD>
                <TD className="text-muted truncate">
                  from {p.account}{p.bucket && p.bucket !== "—" ? ` / ${p.bucket}` : ""}
                </TD>
                <TD align="right"><strong className="text-ink"><Amount value={p.amount} /></strong></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
