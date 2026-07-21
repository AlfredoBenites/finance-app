import { Suspense, lazy, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { dashboardApi, profilesApi } from "../api/client";
import { useSettings } from "../settings/SettingsContext";
import { PageHeader, StatCard, Banner, Amount, Card } from "../components/ui";
import { NetWorthPanel } from "../components/dashboard/BreakdownPanels";

// The charting library is only used here, and it is the heaviest thing the app
// pulls in, so the other pages don't download it.
const SpendingSection = lazy(() => import("../components/insights/SpendingSection"));

// Private/overview figures live here (kept off the dashboard so they aren't on
// screen in public): total income, total assets, net worth, and where the
// money actually goes.
export default function InsightsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const { dashboardPrefs } = useSettings();
  const { hideRepayments, onlyMyDebt } = dashboardPrefs;

  const [redirected, setRedirected] = useState([]);

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

  useEffect(() => {
    profilesApi.cashbackRedirected().then(setRedirected).catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader title="Insights" subtitle="Your overview and spending breakdowns." />

      {error && <Banner tone="danger">Error: {error}</Banner>}
      {!data && !error && <p className="text-muted text-sm">Loading…</p>}

      {data && (
        // All four on one line once there's room for it. Below that they stay
        // two by two: with the sidebar taking 15rem, four across on a narrower
        // window would push a six-figure number off its card.
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <StatCard size="sm" label="Total income" value={<Amount value={data.total_income} />} tone="green" />
          <StatCard size="sm" label="Total assets" value={<Amount value={data.total_assets} />} />
          <StatCard size="sm" label="Total card balance" value={<Amount value={data.total_credit_card_debt} />} tone="danger" />
          <Link to="?panel=networth" className="block">
            <StatCard
              size="sm"
              label="Net worth ›"
              value={<Amount value={data.net_worth} />}
              className="h-full cursor-pointer hover:bg-surface-muted hover:border-border-strong transition-colors"
            />
          </Link>
        </section>
      )}

      <Suspense fallback={<p className="text-muted text-sm">Loading…</p>}>
        <SpendingSection />
      </Suspense>

      {/* Sits under the charts: it's a footnote to the year, not a headline. */}
      {redirected.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-ink mb-1">Cashback from other profiles</h2>
          <p className="text-xs text-muted mb-3">
            Cashback credited to you from spending under other people's profiles.
          </p>
          <Card className="divide-y divide-border">
            {redirected.map((r) => (
              <div key={r.profile_id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0 text-sm">
                <span className="text-ink truncate">{r.name}</span>
                <span className="text-muted whitespace-nowrap">
                  earned <strong className="text-green"><Amount value={r.earned} /></strong>
                  {" · "}pending <Amount value={r.pending} />
                </span>
              </div>
            ))}
          </Card>
        </section>
      )}

      <NetWorthPanel open={panelParam === "networth"} onClose={() => setSearchParams({})} />
    </div>
  );
}
