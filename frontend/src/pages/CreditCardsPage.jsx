import { useEffect, useState } from "react";
import { creditCardsApi, cashbackRulesApi, categoriesApi } from "../api/client";
import { CATEGORIES as FALLBACK_CATEGORIES } from "../constants";

export default function CreditCardsPage() {
  const [cards, setCards] = useState([]);
  const [name, setName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [cashbackPct, setCashbackPct] = useState("");
  const [error, setError] = useState(null);

  // Which card's category-rules panel is open, and that card's rules.
  const [openCardId, setOpenCardId] = useState(null);
  const [rules, setRules] = useState([]);
  const [ruleCategory, setRuleCategory] = useState(FALLBACK_CATEGORIES[0]);
  const [rulePct, setRulePct] = useState("");
  const [categoryList, setCategoryList] = useState(FALLBACK_CATEGORIES);

  async function loadCards() {
    try {
      setCards(await creditCardsApi.list());
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    loadCards();
    categoriesApi
      .list()
      .then((cats) => {
        const names = new Set([...FALLBACK_CATEGORIES, ...cats.map((c) => c.name)]);
        setCategoryList([...names].sort());
      })
      .catch(() => {});
  }, []);

  async function handleAdd(e) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
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
      if (openCardId === id) setOpenCardId(null);
      loadCards();
    } catch (e) {
      setError(e.message);
    }
  }

  async function toggleRules(cardId) {
    if (openCardId === cardId) {
      setOpenCardId(null);
      return;
    }
    try {
      setError(null);
      setRulePct("");
      setRuleCategory(categoryList[0] || FALLBACK_CATEGORIES[0]);
      setRules(await cashbackRulesApi.listForCard(cardId));
      setOpenCardId(cardId);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleAddRule(e) {
    e.preventDefault();
    if (rulePct === "") return;
    try {
      await cashbackRulesApi.upsert(openCardId, ruleCategory, Number(rulePct) / 100);
      setRulePct("");
      setRules(await cashbackRulesApi.listForCard(openCardId));
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDeleteRule(ruleId) {
    try {
      await cashbackRulesApi.remove(ruleId);
      setRules(await cashbackRulesApi.listForCard(openCardId));
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
          placeholder="Default cashback %"
          type="number"
          step="0.01"
        />
        <button type="submit">Add</button>
      </form>

      {error && <p style={{ color: "#dc2626" }}>Error: {error}</p>}

      {cards.length === 0 && <p>No credit cards yet.</p>}

      {cards.map((c) => (
        <div key={c.id}>
          <div className="card">
            <span>
              {c.name}
              {c.issuer ? ` · ${c.issuer}` : ""}
              {c.default_cashback_rate != null
                ? ` · ${(Number(c.default_cashback_rate) * 100).toFixed(2)}% default`
                : ""}
            </span>
            <span style={{ display: "flex", gap: 6 }}>
              <button onClick={() => toggleRules(c.id)}>
                {openCardId === c.id ? "Hide categories" : "Cashback by category"}
              </button>
              <button className="danger" onClick={() => handleDelete(c.id)}>
                Delete
              </button>
            </span>
          </div>

          {openCardId === c.id && (
            <div style={{ margin: "0 0 16px 16px" }}>
              <form onSubmit={handleAddRule}>
                <select
                  value={ruleCategory}
                  onChange={(e) => setRuleCategory(e.target.value)}
                >
                  {categoryList.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Cashback %"
                  value={rulePct}
                  onChange={(e) => setRulePct(e.target.value)}
                />
                <button type="submit">Set</button>
              </form>
              {rules.length === 0 && (
                <p><small>No category rules — uses the card default.</small></p>
              )}
              {rules.map((r) => (
                <div className="card" key={r.id}>
                  <span>
                    {r.category}: {(Number(r.rate) * 100).toFixed(2)}%
                  </span>
                  <button className="danger" onClick={() => handleDeleteRule(r.id)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
