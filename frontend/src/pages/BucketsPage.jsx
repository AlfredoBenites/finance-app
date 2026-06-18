import { useEffect, useState } from "react";
import { bucketsApi, creditCardsApi } from "../api/client";
import { money } from "../format";

export default function BucketsPage() {
  const [buckets, setBuckets] = useState([]);
  const [cards, setCards] = useState([]);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");
  const [addAmounts, setAddAmounts] = useState({});
  const [error, setError] = useState(null);

  const cardName = (id) => cards.find((c) => c.id === id)?.name ?? "";

  async function load() {
    try {
      const [b, c] = await Promise.all([bucketsApi.list(), creditCardsApi.list()]);
      setBuckets(b);
      setCards(c);
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
      await bucketsApi.create({
        name: name.trim(),
        target_amount: target === "" ? null : Number(target),
        current_amount: current === "" ? 0 : Number(current),
      });
      setName("");
      setTarget("");
      setCurrent("");
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  // Add money to a bucket (saving toward the goal / paying down a card).
  async function addMoney(bucket) {
    const add = Number(addAmounts[bucket.id]);
    if (!add) return;
    try {
      await bucketsApi.update(bucket.id, {
        current_amount: Number(bucket.current_amount) + add,
      });
      setAddAmounts((m) => ({ ...m, [bucket.id]: "" }));
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

  return (
    <div>
      <h1>Buckets</h1>
      <p>
        <small>
          Money set aside for a purpose. A card's payoff bucket reduces that card's
          remaining debt as you add to it.
        </small>
      </p>

      <form onSubmit={handleAdd} style={{ flexWrap: "wrap" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bucket name" />
        <input type="number" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Target $" />
        <input type="number" step="0.01" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Saved $" />
        <button type="submit">Add bucket</button>
      </form>

      {error && <p style={{ color: "#dc2626" }}>Error: {error}</p>}
      {buckets.length === 0 && <p>No buckets yet.</p>}

      {buckets.map((b) => (
        <div className="card" key={b.id}>
          <span>
            {b.name}
            {b.credit_card_id ? ` · 💳 ${cardName(b.credit_card_id)}` : ""}
            <br />
            <small>
              {money(b.current_amount)}
              {b.target_amount != null ? ` / ${money(b.target_amount)}` : ""}
            </small>
          </span>
          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="number"
              step="0.01"
              placeholder="Add $"
              style={{ width: 80 }}
              value={addAmounts[b.id] ?? ""}
              onChange={(e) => setAddAmounts((m) => ({ ...m, [b.id]: e.target.value }))}
            />
            <button onClick={() => addMoney(b)}>Add</button>
            {!b.credit_card_id && (
              <button className="danger" onClick={() => handleDelete(b.id)}>Delete</button>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
