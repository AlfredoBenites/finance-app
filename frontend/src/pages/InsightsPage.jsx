import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { dashboardApi } from "../api/client";
import { useSettings } from "../settings/SettingsContext";
import { PageHeader, StatCard, Banner, Amount, Card } from "../components/ui";
import { NetWorthPanel } from "../components/dashboard/BreakdownPanels";

// Private/overview figures live here (kept off the dashboard so they aren't on
// screen in public): total income, total assets, net worth. Spending charts
// land next.
export default function InsightsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const { dashboardPrefs } = useSettings();
  const { hideRepayments, onlyMyDebt } = dashboardPrefs;

  const [searchParams, setSearchParams] = useSearchParams();
  const panelParam = searchParams.get("panel"); // "networth"

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    dashboardApi
      .get({ onlyPrimary: onlyMyDebt, excludeRepayments: hideRepayments })
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [hideRepayments, onlyMyDebt]);

  return (
    <div>
      <PageHeader title="Insights" subtitle="Your overview and spending breakdowns." />

      {error && <Banner tone="danger">Error: {error}</Banner>}
      {!data && !error && <p className="text-muted text-sm">Loading…</p>}

      {data && (
        <section className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
          <StatCard label="Total income" value={<Amount value={data.total_income} />} tone="green" />
          <StatCard label="Total assets" value={<Amount value={data.total_assets} />} />
          <StatCard label="Total card balance" value={<Amount value={data.total_credit_card_debt} />} tone="danger" />
          <Link to="?panel=networth" className="block">
            <StatCard
              label="Net worth ›"
              value={<Amount value={data.net_worth} />}
              className="cursor-pointer hover:bg-surface-muted hover:border-border-strong transition-colors"
            />
          </Link>
        </section>
      )}

      <Card className="text-sm text-muted">Spending charts coming next.</Card>

      <NetWorthPanel open={panelParam === "networth"} onClose={() => setSearchParams({})} />
    </div>
  );
}
