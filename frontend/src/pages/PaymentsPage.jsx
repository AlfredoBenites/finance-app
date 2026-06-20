import { useEffect, useState } from "react";
import { creditCardsApi, accountsApi, bucketsApi, dashboardApi } from "../api/client";
import { money } from "../format";

const today = () => new Date().toISOString().slice(0, 10);

export default function PaymentsPage() {
  const [cards, setCards] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [buckets, setBuckets] = useState([]);
  const [owedByCard, setOwedByCard] = useState({});
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);

  const [cardId, setCardId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [bucketId, setBucketId] = useState("");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(today());

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
    setAmount(owedByCard[id] != null ? String(owedByCard[id]) : "");
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
      <h1>Pay a card</h1>
      <p><small>
        Settle a card's charges by drawing money from an account (and a bucket).
        The card's debt drops, and the money leaves the bucket + account balance.
      </small></p>

      <form onSubmit={handlePay} style={{ flexWrap: "wrap" }}>
        <select value={cardId} onChange={(e) => onCardChange(e.target.value)}>
          <option value="">Card…</option>
          {cards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{owedByCard[c.id] ? ` (owes ${money(owedByCard[c.id])})` : ""}
            </option>
          ))}
        </select>
        <select value={accountId} onChange={(e) => { setAccountId(e.target.value); setBucketId(""); }}>
          <option value="">From account…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name} ({money(a.balance)})</option>
          ))}
        </select>
        <select value={bucketId} onChange={(e) => setBucketId(e.target.value)} disabled={!accountId}>
          <option value="">From bucket… (optional)</option>
          {accountBuckets.map((b) => (
            <option key={b.id} value={b.id}>{b.name} ({money(b.current_amount)})</option>
          ))}
        </select>
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" />
        <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        <button type="submit">Pay</button>
      </form>

      {error && <p style={{ color: "#dc2626" }}>Error: {error}</p>}

      <h2>Payment history</h2>
      {history.length === 0 && <p>No payments yet.</p>}
      {history.map((p) => (
        <div className="card" key={p.id}>
          <span>{p.paid_on || ""} · {p.card} · from {p.account}{p.bucket !== "—" ? ` / ${p.bucket}` : ""}</span>
          <strong>{money(p.amount)}</strong>
        </div>
      ))}
    </div>
  );
}
