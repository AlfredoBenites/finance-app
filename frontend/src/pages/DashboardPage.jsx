import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { dashboardApi } from "../api/client";
import { useSettings } from "../settings/SettingsContext";
import { formatDate } from "../format";
import {
  PageHeader,
  StatCard,
  Card,
  Badge,
  Banner,
  Amount,
  Table,
  THead,
  TH,
  TR,
  TD,
  cn,
} from "../components/ui";
import ProfileDetailPanel from "../components/dashboard/ProfileDetailPanel";
import CardDetailPanel from "../components/dashboard/CardDetailPanel";
import { RealAvailablePanel, CashbackPanel } from "../components/dashboard/BreakdownPanels";

// Upcoming payments warm up as the due date nears: blue (plenty of time),
// orange (within a week), red (2 days or less).
const paymentTone = (days) => (days <= 2 ? "danger" : days <= 7 ? "orange" : "info");
const daysLabel = (days) =>
  days < 0 ? "Past due" : days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"}`;

// Section heading shown above each card on the dashboard.
function SectionTitle({ children }) {
  return <h2 className="text-base font-semibold text-ink mb-2">{children}</h2>;
}

// A balance section (Profile or Card) as a card whose list scrolls internally.
// On desktop it fills its grid cell's height; on mobile it grows naturally.
function BalanceCard({ empty, children }) {
  return (
    <Card padded={false} className="flex flex-col overflow-hidden md:flex-1 md:min-h-0">
      {empty ? (
        <p className="text-muted text-sm px-4 py-6">{empty}</p>
      ) : (
        <ul className="divide-y divide-border overflow-y-auto md:flex-1">{children}</ul>
      )}
    </Card>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  // Calculation prefs live in Settings now. The dashboard is all current-state
  // (no year/period filter).
  const { profileSort, dashboardPrefs } = useSettings();
  const { onlyMyDebt, hideRepayments } = dashboardPrefs;
  const cashbackScope = dashboardPrefs.cashbackScope || "all";

  const navigate = useNavigate();

  // Detail/explainer panels are URL-addressable (?profile / ?card / ?panel) so
  // they're shareable and middle-click-openable in a new tab.
  const [searchParams, setSearchParams] = useSearchParams();
  const profileParam = searchParams.get("profile");
  const cardParam = searchParams.get("card");
  const panelParam = searchParams.get("panel"); // "real" | "cashback"
  const closePanel = () => setSearchParams({});

  // Order of the profile list, per the user's Settings choice.
  const owedProfiles = useMemo(() => {
    const arr = data?.owed_by_profile ? [...data.owed_by_profile] : [];
    if (profileSort.mode === "asc") arr.sort((a, b) => a.amount - b.amount);
    else if (profileSort.mode === "custom") {
      const rank = (id) => {
        const i = (profileSort.order || []).indexOf(id);
        return i === -1 ? Infinity : i;
      };
      arr.sort((a, b) => rank(a.profile_id) - rank(b.profile_id));
    } else arr.sort((a, b) => b.amount - a.amount); // desc (default)
    return arr;
  }, [data, profileSort]);

  useEffect(() => {
    let cancelled = false;
    // The very first request right after login can lose a race (CORS preflight
    // / token settling), so retry once before showing an error.
    async function load(attempt = 0) {
      try {
        const d = await dashboardApi.get({
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
  }, [hideRepayments, onlyMyDebt]);

  const header = <PageHeader title="Dashboard" className="!mb-0" />;

  if (error)
    return (
      <div>
        {header}
        <Banner tone="danger" className="mt-4">Error: {error}</Banner>
      </div>
    );
  if (!data)
    return (
      <div>
        {header}
        <p className="text-muted text-sm mt-4">Loading…</p>
      </div>
    );

  const cardName = data.debt_by_card.find((c) => c.credit_card_id === cardParam)?.name;
  const cashbackTotal =
    cashbackScope === "mine"
      ? data.total_cashback_mine || 0
      : (data.total_cashback_earned || 0) + (data.total_cashback_pending || 0);
  const hasUpcoming = data.upcoming_payments?.length > 0;

  return (
    <>
      {/* On desktop, lay out as a fixed-height grid so the page fills the
          viewport without scrolling; the balances row flexes and its lists
          scroll internally. On mobile it's a normal stacked, scrollable column. */}
      <div
        className={cn(
          "space-y-6 md:space-y-0 md:grid md:gap-4 md:h-[calc(100vh-4rem)]",
          hasUpcoming
            ? "md:grid-rows-[auto_auto_minmax(0,1fr)_auto]"
            : "md:grid-rows-[auto_auto_minmax(0,1fr)]"
        )}
      >
        {header}

        {/* Summary (top) */}
        <section>
          <SectionTitle>Summary</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Link to="?panel=real" className="block">
              <StatCard
                label="Real available money ›"
                value={<Amount value={data.real_available_money} />}
                hint="Free to spend after card debt and set-aside buckets. Tap for the breakdown."
                className="h-full cursor-pointer hover:bg-surface-muted hover:border-border-strong transition-colors"
              />
            </Link>
            <Link to="?panel=cashback" className="block">
              <StatCard
                label="Cashback ›"
                value={<Amount value={cashbackTotal} />}
                hint={
                  cashbackScope === "mine"
                    ? "Your own cashback. Tap to see it by card and person."
                    : "All cashback accrued. Tap to see it by card and person."
                }
                className="h-full cursor-pointer hover:bg-surface-muted hover:border-border-strong transition-colors"
              />
            </Link>
          </div>
        </section>

        {/* Unallocated balances (middle, fills remaining height) */}
        <section className="grid md:grid-cols-2 gap-6 md:min-h-0">
          <div className="flex flex-col md:min-h-0">
            <SectionTitle>Unallocated Balance by Profile</SectionTitle>
            <BalanceCard empty={owedProfiles.length === 0 ? "Nothing owed." : null}>
              {owedProfiles.map((p) => (
                <li key={p.profile_id}>
                  <Link
                    to={`?profile=${p.profile_id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted transition-colors"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-ink truncate">{p.name}</span>
                      {p.non_card_amount > 0.005 && (
                        <Badge tone="warn">Attention needed</Badge>
                      )}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <strong><Amount value={p.amount} /></strong>
                      <ChevronRight size={16} className="text-muted" />
                    </span>
                  </Link>
                </li>
              ))}
            </BalanceCard>
          </div>

          <div className="flex flex-col md:min-h-0">
            <SectionTitle>Unallocated Balance by Card</SectionTitle>
            <BalanceCard empty={data.debt_by_card.length === 0 ? "No cards yet." : null}>
              {data.debt_by_card.map((c) => (
                <li key={c.credit_card_id}>
                  <Link
                    to={`?card=${c.credit_card_id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted transition-colors"
                  >
                    <span className="text-ink">
                      {c.name}
                      <br />
                      <span className="text-xs text-muted">
                        <Amount value={c.saved} /> saved in its bucket
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <strong className="flex items-center gap-1">
                        <Amount value={c.balance} tone={c.balance > 0.005 ? "danger" : "muted"} />
                        <span className={c.balance > 0.005 ? "text-danger" : "text-muted"}>unallocated</span>
                      </strong>
                      <ChevronRight size={16} className="text-muted" />
                    </span>
                  </Link>
                </li>
              ))}
            </BalanceCard>
          </div>
        </section>

        {/* Upcoming payments (bottom) */}
        {hasUpcoming && (
          <section className="md:min-h-0 md:overflow-hidden flex flex-col">
            <SectionTitle>Upcoming Payments</SectionTitle>
            <div className="overflow-auto">
              <Table>
                <THead>
                  <tr>
                    <TH>Card</TH>
                    <TH>Due date</TH>
                    <TH>Due in</TH>
                    <TH align="right">Amount</TH>
                  </tr>
                </THead>
                <tbody>
                  {data.upcoming_payments.map((p, i) => (
                    <TR
                      key={i}
                      onClick={() => navigate("/payments")}
                      className="cursor-pointer"
                      title="Go to Pay a card"
                    >
                      <TD className="text-ink">{p.name}</TD>
                      <TD className="text-ink whitespace-nowrap tabular-nums">{formatDate(p.due_date)}</TD>
                      <TD>
                        <Badge tone={paymentTone(p.days_until)}>{daysLabel(p.days_until)}</Badge>
                      </TD>
                      <TD align="right">
                        <strong><Amount value={p.amount} /></strong>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
          </section>
        )}
      </div>

      <ProfileDetailPanel
        profileId={profileParam}
        open={!!profileParam}
        onClose={closePanel}
        mismatchAmount={owedProfiles.find((p) => p.profile_id === profileParam)?.non_card_amount || 0}
      />
      <CardDetailPanel cardId={cardParam} cardName={cardName} open={!!cardParam} onClose={closePanel} />
      <RealAvailablePanel open={panelParam === "real"} onClose={closePanel} />
      <CashbackPanel open={panelParam === "cashback"} onClose={closePanel} />
    </>
  );
}
