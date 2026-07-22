import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { accountsApi, creditCardsApi, profilesApi, transactionsApi } from "../../api/client";
import YearSelect, { CURRENT_YEAR } from "../YearSelect";
import { Card, Banner, Select, cn } from "../ui";
import SpendingByMonthChart from "./SpendingByMonthChart";
import SpendingByCategoryChart from "./SpendingByCategoryChart";
import SpendingBySourceChart from "./SpendingBySourceChart";
import CategoryTransactionsPanel from "./CategoryTransactionsPanel";
import {
  byCategory,
  byMonth,
  bySource,
  monthLabel,
  monthlyAverage,
  normalize,
  sourceNames,
  transactionsFor,
} from "./spending";

// The spending charts: one fetch of a year's transactions, then everything is
// derived from it in the browser. Picking a month in the first chart scopes the
// other two.
export default function SpendingSection() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [profileId, setProfileId] = useState(null); // null until the default resolves
  const [month, setMonth] = useState(null); // "2026-07", or null for the whole year

  const [profiles, setProfiles] = useState([]);
  const [cards, setCards] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // The category row whose transactions are open in the panel.
  const [detailRow, setDetailRow] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // The month axis covers one year, so "All time" shows the current one.
  const fetchYear = year === "all" ? CURRENT_YEAR : year;

  useEffect(() => {
    let cancelled = false;
    Promise.all([profilesApi.list(), creditCardsApi.list(), accountsApi.list()])
      .then(([p, c, a]) => {
        if (cancelled) return;
        setProfiles(p);
        setCards(c);
        setAccounts(a);
        // Cards are shared and other people's charges sit in the same list, so
        // the charts start on your own spending rather than everyone's.
        setProfileId((current) => current ?? (p.find((x) => x.is_primary)?.id ?? "all"));
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!profileId) return; // wait for the default profile
    let cancelled = false;
    setLoading(true);
    transactionsApi
      .list({ year: fetchYear, ...(profileId !== "all" && { profile_id: profileId }) })
      .then((r) => {
        if (cancelled) return;
        setRows(r);
        setError(null);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchYear, profileId]);

  // A month from the year you just left would silently filter to nothing.
  useEffect(() => {
    setMonth(null);
  }, [fetchYear, profileId]);

  const txns = useMemo(() => normalize(rows || []), [rows]);
  const months = useMemo(() => byMonth(txns, fetchYear), [txns, fetchYear]);
  const average = useMemo(() => monthlyAverage(months), [months]);
  const categories = useMemo(() => byCategory(txns, month), [txns, month]);
  const sources = useMemo(() => bySource(txns, month, cards, accounts), [txns, month, cards, accounts]);
  const yearTotal = useMemo(() => months.reduce((sum, m) => sum + m.total, 0), [months]);
  const nameOfSource = useMemo(() => sourceNames(cards, accounts), [cards, accounts]);

  const periodLabel = month ? monthLabel(month) : `All of ${fetchYear}`;

  // Drilling into a category is a per-month thing: a whole year of one category
  // would be hundreds of rows, and the Expenses page already does that job.
  const openCategory = (row) => {
    if (!month) return;
    setDetailRow(row);
    setDetailOpen(true);
  };
  const detailTransactions = useMemo(
    () => transactionsFor(txns, month, detailRow),
    [txns, month, detailRow]
  );

  const filters = (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <YearSelect value={year} onChange={setYear} />
      <Select value={profileId ?? ""} onChange={(e) => setProfileId(e.target.value)}>
        <option value="all">Everyone</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.is_primary ? " (you)" : ""}
          </option>
        ))}
      </Select>
      {month && (
        <button
          type="button"
          onClick={() => setMonth(null)}
          className="inline-flex items-center gap-1.5 bg-surface text-ink border border-border rounded-md pl-3 pr-2 py-2 text-sm hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {monthLabel(month)}
          <X size={14} className="text-muted" />
        </button>
      )}
    </div>
  );

  if (error) {
    return (
      <section className="mb-8">
        {filters}
        <Banner tone="danger">Error: {error}</Banner>
      </section>
    );
  }

  if (rows === null) {
    return (
      <section className="mb-8">
        {filters}
        <p className="text-muted text-sm">Loading…</p>
      </section>
    );
  }

  if (rows.length === 0) {
    return (
      <section className="mb-8">
        {filters}
        <Card className="text-sm text-muted">
          No spending recorded in {fetchYear} yet.{" "}
          <Link to="/transactions" className="text-ink underline underline-offset-2">
            Add an expense
          </Link>
        </Card>
      </section>
    );
  }

  return (
    // Dim rather than blank out while refetching: no skeleton flash, no jump.
    <section className={cn("mb-8 space-y-4 transition-opacity", loading && "opacity-60")}>
      {filters}
      {year === "all" && (
        <p className="text-xs text-muted">
          Spending charts cover one year at a time. Showing {CURRENT_YEAR}.
        </p>
      )}
      <SpendingByMonthChart
        months={months}
        average={average}
        selectedMonth={month}
        onSelectMonth={(ym) => setMonth((current) => (current === ym ? null : ym))}
        total={yearTotal}
      />
      <SpendingByCategoryChart
        rows={categories.rows}
        grand={categories.grand}
        netZeroOrLess={categories.netZeroOrLess}
        periodLabel={periodLabel}
        onSelectRow={month ? openCategory : undefined}
      />
      <SpendingBySourceChart list={sources.list} grand={sources.grand} periodLabel={periodLabel} />

      <CategoryTransactionsPanel
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        row={detailRow}
        monthLabel={detailRow && month ? monthLabel(month) : ""}
        transactions={detailTransactions}
        sourceName={nameOfSource}
      />
    </section>
  );
}
