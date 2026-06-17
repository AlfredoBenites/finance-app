import { useEffect, useState } from "react";
import { creditCardsApi } from "../api/client";

export default function CreditCardsPage() {
  const [cards, setCards] = useState([]);
  const [name, setName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [cashbackPct, setCashbackPct] = useState("");
  const [error, setError] = useState(null);

  async function loadCards() {
    try {
      setCards(await creditCardsApi.list());
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    loadCards();
  }, []);

  async function handleAdd(e) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      // User enters a percent (e.g. 1.5); store as a rate (0.015).
      const rate = cashbackPct === "" ? null : Number(cashbackPct) / 100;
      await creditCardsApi.create({
        name: name.trim(),
        issuer: issuer.trim() || null,
        default_cashback_rate: rate,
      });
      setName("");
      setIssuer("");
      setCashbackPct("");
      loadCards();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(id) {
    try {
      await creditCardsApi.remove(id);
      loadCards();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <h1>Credit Cards</h1>

      <form onSubmit={handleAdd}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Card name (e.g., Chase Freedom)"
        />
        <input
          value={issuer}
          onChange={(e) => setIssuer(e.target.value)}
          placeholder="Issuer (e.g., Chase)"
        />
        <input
          value={cashbackPct}
          onChange={(e) => setCashbackPct(e.target.value)}
          placeholder="Cashback %"
          type="number"
          step="0.01"
        />
        <button type="submit">Add</button>
      </form>

      {error && <p style={{ color: "#dc2626" }}>Error: {error}</p>}

      {cards.length === 0 && <p>No credit cards yet.</p>}

      {cards.map((c) => (
        <div className="card" key={c.id}>
          <span>
            {c.name}
            {c.issuer ? ` · ${c.issuer}` : ""}
            {c.default_cashback_rate != null
              ? ` · ${(Number(c.default_cashback_rate) * 100).toFixed(2)}% back`
              : ""}
          </span>
          <button className="danger" onClick={() => handleDelete(c.id)}>
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
