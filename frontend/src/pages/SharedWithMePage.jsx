import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { sharesApi } from "../api/client";
import { formatDate } from "../format";
import { useSettings } from "../settings/SettingsContext";
import {
  PageHeader,
  Card,
  Button,
  Badge,
  Banner,
  Amount,
  StatCard,
  Select,
  Input,
  Table,
  THead,
  TH,
  TR,
  TD,
  cn,
} from "../components/ui";
import SharedChargePanel from "../components/shares/SharedChargePanel";

// Read-only view of profiles other people have shared with you: what you still
// owe each of them, and the charges behind it. Everything here belongs to the
// person who shared it, so there is nothing to edit.
const EMPTY_FILTERS = { profile: "", status: "unpaid", search: "" };

export default function SharedWithMePage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const { sharedPerPage } = useSettings();
  const pageSize = sharedPerPage || 15;

  const [detailCharge, setDetailCharge] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const openDetail = (c) => {
    setDetailCharge(c);
    setDetailOpen(true);
  };

  useEffect(() => {
    sharesApi
      .sharedWithMe()
      .then((data) => {
        setItems(data);
        setLoaded(true);
      })
      .catch((e) => {
        setError(e.message);
        setLoaded(true);
      });
  }, []);

  // Every shared profile's charges in one list, newest first, each tagged with
  // who shared it so a single table can cover them all.
  const charges = useMemo(
    () =>
      items
        .flatMap((p) =>
          (p.transactions || []).map((t) => ({
            ...t,
            profile_id: p.profile_id,
            profile_name: p.profile_name,
          }))
        )
        .sort((a, b) => String(b.transaction_date).localeCompare(String(a.transaction_date))),
    [items]
  );

  const multi = items.length > 1;
  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const visible = charges.filter((t) => {
    if (filters.profile && t.profile_id !== filters.profile) return false;
    if (filters.status === "unpaid" && t.is_paid_back) return false;
    if (filters.status === "paid" && !t.is_paid_back) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!`${t.merchant || ""} ${t.category || ""} ${t.notes || ""}`.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  useEffect(() => {
    setPage(0);
  }, [filters, pageSize]);
  const total = visible.length;
  const start = page * pageSize;
  const pageItems = visible.slice(start, start + pageSize);

  // Keep the charge in state through the panel's close animation.
  const shown = detailCharge ? charges.find((c) => c.id === detailCharge.id) || detailCharge : null;

  return (
    <div>
      <PageHeader
        title="Shared with me"
        subtitle="Profiles other people have shared with you. Read only."
      />

      {error && <Banner tone="danger" className="mb-4">Error: {error}</Banner>}
      {!loaded && !error && <p className="text-muted text-sm">Loading…</p>}

      {loaded && items.length === 0 && !error && (
        <Card className="text-sm text-muted">
          Nothing has been shared with you yet. When someone shares a profile with your email
          address, what you owe them shows up here.
        </Card>
      )}

      {items.length > 0 && (
        <>
          {/* What you still owe each person */}
          <section className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
            {items.map((p) => {
              const stat = (
                <StatCard
                  label={`You owe ${p.profile_name}`}
                  value={<Amount value={p.total_unpaid} />}
                  hint="Unpaid card charges"
                  tone={p.total_unpaid > 0 ? "danger" : "muted"}
                  className={
                    multi
                      ? "h-full text-left cursor-pointer transition-colors hover:bg-surface-muted hover:border-border-strong"
                      : undefined
                  }
                />
              );
              // With several people shared, a card doubles as a filter for that
              // person's charges. With one there is nothing to filter down to.
              return multi ? (
                <button
                  key={p.profile_id}
                  type="button"
                  onClick={() =>
                    setFilter("profile", filters.profile === p.profile_id ? "" : p.profile_id)
                  }
                  className="block text-left"
                >
                  {stat}
                </button>
              ) : (
                <div key={p.profile_id}>{stat}</div>
              );
            })}
          </section>

          <h2 className="text-lg font-semibold text-ink mb-2">Charges</h2>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {multi && (
              <Select value={filters.profile} onChange={(e) => setFilter("profile", e.target.value)}>
                <option value="">Everyone</option>
                {items.map((p) => (
                  <option key={p.profile_id} value={p.profile_id}>
                    {p.profile_name}
                  </option>
                ))}
              </Select>
            )}
            <Select value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid back</option>
              <option value="">All charges</option>
            </Select>
            <Input
              className="flex-1 min-w-[12rem]"
              placeholder="Search merchant, category, or notes"
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
            />
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              title="Reset filters"
              aria-label="Reset filters"
              className="grid place-items-center h-9 w-9 rounded-md text-muted transition-colors hover:bg-accent hover:text-accent-ink active:brightness-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <RotateCcw size={16} />
            </button>
          </div>

          {total === 0 ? (
            <p className="text-muted text-sm">No charges match.</p>
          ) : (
            <>
              <Table className="table-fixed sm:min-w-[44rem]">
                <THead>
                  <tr>
                    <TH className={cn("hidden sm:table-cell", multi ? "w-[13%]" : "w-[14%]")}>Date</TH>
                    {multi && <TH className="w-[15%]">Shared by</TH>}
                    <TH className={multi ? "w-[24%]" : "w-[30%]"}>Merchant</TH>
                    <TH className={cn("hidden sm:table-cell", multi ? "w-[18%]" : "w-[20%]")}>Category</TH>
                    <TH className={cn("hidden sm:table-cell", multi ? "w-[14%]" : "w-[16%]")}>Status</TH>
                    <TH align="right" className={multi ? "w-[16%]" : "w-[20%]"}>
                      Amount
                    </TH>
                  </tr>
                </THead>
                <tbody>
                  {pageItems.map((t) => (
                    <TR key={t.id} onClick={() => openDetail(t)} className="cursor-pointer">
                      <TD className="hidden sm:table-cell text-ink whitespace-nowrap tnum">
                        {formatDate(t.transaction_date)}
                      </TD>
                      {multi && <TD className="text-ink truncate">{t.profile_name}</TD>}
                      <TD>
                        <span className="block truncate text-ink font-medium">
                          {t.merchant || "—"}
                        </span>
                        <span className="sm:hidden inline-flex mt-0.5">
                          <Badge tone={t.is_paid_back ? "success" : "orange"}>
                            {t.is_paid_back ? "Paid back" : "Unpaid"}
                          </Badge>
                        </span>
                      </TD>
                      <TD className="hidden sm:table-cell text-muted truncate">{t.category || "—"}</TD>
                      <TD className="hidden sm:table-cell">
                        <Badge tone={t.is_paid_back ? "success" : "orange"}>
                          {t.is_paid_back ? "Paid back" : "Unpaid"}
                        </Badge>
                      </TD>
                      <TD align="right">
                        <strong>
                          <Amount
                            value={-t.amount}
                            tone={t.is_paid_back ? "muted" : "default"}
                          />
                        </strong>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>

              {total > pageSize && (
                <div className="flex items-center justify-between gap-3 mt-3 text-sm">
                  <span className="text-muted">
                    {start + 1}–{Math.min(start + pageSize, total)} of {total}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>
                      Prev
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={start + pageSize >= total}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      <SharedChargePanel
        charge={shown}
        profileName={shown?.profile_name}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </div>
  );
}
