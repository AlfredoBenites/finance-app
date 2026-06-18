import { useEffect, useState } from "react";
import { dashboardApi } from "../api/client";
import YearSelect, { CURRENT_YEAR } from "../components/YearSelect";
import usePersistedState from "../hooks/usePersistedState";
import { money } from "../format";

function Toggle({ on, onClick, label }) {
  return (
    <button
      onClick={onClick}
      style={{ background: on ? "#2563eb" : "#9ca3af" }}
    >
      {label}: {on ? "on" : "off"}
    </button>
  );
}

function Stat({ label, value }) {
  return (
    <div className="card" style={{ flexDirection: "column", alignItems: "flex-start" }}>
      <small>{label}</small>
      <strong style={{ fontSize: 20 }}>{money(value)}</strong>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [hideRepayments, setHideRepayments] = usePersistedState("dash.hideRepayments", false);
  const [onlyMyDebt, setOnlyMyDebt] = usePersistedState("dash.onlyMyDebt", false);

  useEffect(() => {
    let cancelled = false;
    // The very first request right after login can lose a race (CORS preflight
    // / token settling), so retry once before showing an error.
    async function load(attempt = 0) {
      try {
        const d = await dashboardApi.get({
          year: year === "all" ? undefined : year,
          onlyPrimary: onlyMyDebt,
          excludeRepayments: hideRepayments,
        });
        if (!cancelled) setData(d);
      } catch (e) {
        if (attempt < 1) {
          setTimeout(() => load(attempt + 1), 500);
          return;
        }
        if (!cancelled) setError(e.message);
      }
    }
    setData(null);
    setError(null);
    load();
    return () => {
      cancelled = true;
    };
  }, [year, hideRepayments, onlyMyDebt]);

  const header = (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Dashboard</h1>
        <YearSelect value={year} onChange={setYear} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <Toggle on={hideRepayments} onClick={() => setHideRepayments((v) => !v)} label="Hide repayments" />
        <Toggle on={onlyMyDebt} onClick={() => setOnlyMyDebt((v) => !v)} label="Only my debt" />
      </div>
    </div>
  );

  if (error) return <div>{header}<p style={{ color: "#dc2626" }}>Error: {error}</p></div>;
  if (!data) return <div>{header}<p>Loading…</p></div>;

  return (
    <div>
      {header}
      <p><small>Income, spending, cashback and debt below are for {year === "all" ? "all time" : year}; balances/net worth are current.</small></p>

      <Stat label="Total income" value={data.total_income} />
      <Stat label="Total credit card debt" value={data.total_credit_card_debt} />
      <Stat label="Cashback earned" value={data.total_cashback_earned} />
      <Stat label="Cashback pending" value={data.total_cashback_pending} />
      <Stat label="Money set aside in buckets" value={data.total_bucket_money} />
      <Stat label="Liquid cash" value={data.liquid_cash} />
      <Stat label="Real available money" value={data.real_available_money} />
      <Stat label="Total assets" value={data.total_assets} />
      <Stat label="Net worth" value={data.net_worth} />

      <h2>Owed by profile</h2>
      {data.owed_by_profile.length === 0 && <p>Nothing owed.</p>}
      {data.owed_by_profile.map((p) => (
        <div className="card" key={p.profile_id}>
          <span>{p.name}</span>
          <strong>{money(p.amount)}</strong>
        </div>
      ))}

      <h2>Debt by card</h2>
      {data.debt_by_card.length === 0 && <p>No card debt.</p>}
      {data.debt_by_card.map((c) => (
        <div className="card" key={c.credit_card_id}>
          <span>
            {c.name}
            <br />
            <small>owed {money(c.owed)} · saved {money(c.saved)}</small>
          </span>
          <strong>{money(c.balance)} left</strong>
        </div>
      ))}
    </div>
  );
}
