import { useEffect, useState } from "react";
import { creditCardsApi, cashbackRulesApi, categoriesApi } from "../api/client";
import { CATEGORIES as FALLBACK_CATEGORIES } from "../constants";

export default function CreditCardsPage() {
  const [cards, setCards] = useState([]);
  const [name, setName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [cashbackPct, setCashbackPct] = useState("");
  const [statementDay, setStatementDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [dates, setDates] = useState({}); // {cardId: {statement_day, due_day}}
  const [error, setError] = useState(null);

  // Which card's category-rules panel is open, and that card's rules.
  const [openCardId, setOpenCardId] = useState(null);
  const [rules, setRules] = useState([]);
  const [ruleCategory, setRuleCategory] = useState(FALLBACK_CATEGORIES[0]);
  const [rulePct, setRulePct] = useState("");
  const [categoryList, setCategoryList] = useState(FALLBACK_CATEGORIES);

  async function loadCards() {
    try {
      const list = await creditCardsApi.list();
      setCards(list);
      setDates(
        Object.fromEntries(
          list.map((c) => [c.id, { statement_day: c.statement_day ?? "", due_day: c.due_day ?? "" }])
        )
      );
    } catch (e) {
      setError(e.message);
    }
  }

  async function saveDates(cardId) {
    const d = dates[cardId] || {};
    try {
      await creditCardsApi.update(cardId, {
        statement_day: d.statement_day === "" ? null : Number(d.statement_day),
        due_day: d.due_day === "" ? null : Number(d.due_day),
      });
      loadCards();
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
        statement_day: statementDay === "" ? null : Number(statementDay),
        due_day: dueDay === "" ? null : Number(dueDay),
      });
      setName("");
      setIssuer("");
      setCashbackPct("");
      setStatementDay("");
      setDueDay("");
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
        <input
          type="number"
          min="1"
          max="31"
          value={statementDay}
          onChange={(e) => setStatementDay(e.target.value)}
          placeholder="Statement day"
        />
        <input
          type="number"
          min="1"
          max="31"
          value={dueDay}
          onChange={(e) => setDueDay(e.target.value)}
          placeholder="Due day"
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

          <div style={{ margin: "0 0 8px 16px", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <small>Statement day</small>
            <input type="number" min="1" max="31" style={{ width: 56 }}
              value={dates[c.id]?.statement_day ?? ""}
              onChange={(e) => setDates((m) => ({ ...m, [c.id]: { ...m[c.id], statement_day: e.target.value } }))} />
            <small>Due day</small>
            <input type="number" min="1" max="31" style={{ width: 56 }}
              value={dates[c.id]?.due_day ?? ""}
              onChange={(e) => setDates((m) => ({ ...m, [c.id]: { ...m[c.id], due_day: e.target.value } }))} />
            <button onClick={() => saveDates(c.id)}>Save dates</button>
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
