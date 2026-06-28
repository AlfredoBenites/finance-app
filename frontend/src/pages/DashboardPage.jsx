import { useEffect, useState } from "react";
import { dashboardApi } from "../api/client";
import YearSelect, { CURRENT_YEAR } from "../components/YearSelect";
import usePersistedState from "../hooks/usePersistedState";
import { money } from "../format";
import {
  PageHeader,
  StatCard,
  Card,
  Banner,
  Toggle,
  Amount,
} from "../components/ui";

// Upcoming payments warm up as the due date nears: blue (plenty of time) →
// orange (within a week) → red (2 days or less).
const paymentTone = (days) => (days <= 2 ? "danger" : days <= 7 ? "orange" : "info");

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
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`Income, spending, cashback and debt are for ${
          year === "all" ? "all time" : year
        }; balances and net worth are current.`}
        actions={<YearSelect value={year} onChange={setYear} />}
      />
      <div className="flex gap-5 mb-6 flex-wrap">
        <Toggle on={hideRepayments} onClick={() => setHideRepayments((v) => !v)} label="Hide repayments" />
        <Toggle on={onlyMyDebt} onClick={() => setOnlyMyDebt((v) => !v)} label="Only my debt" />
      </div>
    </>
  );

  if (error)
    return (
      <div>
        {header}
        <Banner tone="danger">Error: {error}</Banner>
      </div>
    );
  if (!data)
    return (
      <div>
        {header}
        <p className="text-muted text-sm">Loading…</p>
      </div>
    );

  return (
    <div>
      {header}

      {data.upcoming_payments?.length > 0 && (
        <section className="mb-6">
          <h2 className="text-lg font-semibold text-ink mb-3">Upcoming payments</h2>
          <div className="space-y-2">
            {data.upcoming_payments.map((p, i) => (
              <Banner key={i} tone={paymentTone(p.days_until)}>
                <div className="flex items-center justify-between gap-3">
                  <span>
                    {p.name} — due {p.due_date}{" "}
                    <span className="text-muted">
                      ({p.days_until === 0 ? "today" : `in ${p.days_until} day${p.days_until === 1 ? "" : "s"}`})
                    </span>
                  </span>
                  <strong><Amount value={p.amount} /></strong>
                </div>
              </Banner>
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
        <StatCard label="Total income" value={<Amount value={data.total_income} />} tone="green" />
        <StatCard label="Total credit card debt" value={<Amount value={data.total_credit_card_debt} />} tone="danger" />
        <StatCard label="Cashback earned" value={<Amount value={data.total_cashback_earned} />} tone="green" />
        <StatCard label="Cashback pending" value={<Amount value={data.total_cashback_pending} />} tone="muted" />
        <StatCard label="Money set aside in buckets" value={<Amount value={data.total_bucket_money} />} />
        <StatCard label="Liquid cash" value={<Amount value={data.liquid_cash} />} />
        <StatCard label="Real available money" value={<Amount value={data.real_available_money} />} accent />
        <StatCard label="Total assets" value={<Amount value={data.total_assets} />} />
        <StatCard label="Net worth" value={<Amount value={data.net_worth} />} accent />
      </section>

      <section className="grid md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold text-ink mb-3">Total Balance by Profile</h2>
          {data.owed_by_profile.length === 0 ? (
            <p className="text-muted text-sm">Nothing owed.</p>
          ) : (
            <div className="space-y-2">
              {data.owed_by_profile.map((p) => (
                <Card key={p.profile_id} className="flex items-center justify-between py-3">
                  <span className="text-ink">{p.name}</span>
                  <strong><Amount value={p.amount} /></strong>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-lg font-semibold text-ink mb-3">Total Balance by Card</h2>
          {data.debt_by_card.length === 0 ? (
            <p className="text-muted text-sm">No card debt.</p>
          ) : (
            <div className="space-y-2">
              {data.debt_by_card.map((c) => (
                <Card key={c.credit_card_id} className="flex items-center justify-between py-3">
                  <span className="text-ink">
                    {c.name}
                    <br />
                    <span className="text-xs text-muted">saved {money(c.saved)} in its bucket</span>
                  </span>
                  <strong className="flex items-center gap-1">
                    <Amount value={c.balance} tone="danger" />
                    <span className="text-danger">owed</span>
                  </strong>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
