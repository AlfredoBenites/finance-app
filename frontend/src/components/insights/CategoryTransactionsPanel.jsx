import { SlideOver, Amount, Table, THead, TH, TR, TD } from "../ui";
import { formatDate } from "../../format";

// The transactions behind one category, for the month picked in the chart above.
// Biggest first, since the reason to open this is "what made this so big".
// Refunds are in here too, as negatives, because they are why the category
// total is what it is.
export default function CategoryTransactionsPanel({
  open,
  onClose,
  row,
  monthLabel,
  transactions,
  sourceName,
}) {
  const total = transactions.reduce((sum, t) => sum + t.cents, 0) / 100;

  return (
    <SlideOver open={open} onClose={onClose} title={row?.name || "Category"} subtitle={monthLabel}>
      {row && (
        <div className="space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-muted">
              {transactions.length} {transactions.length === 1 ? "transaction" : "transactions"}
            </span>
            <span className="text-lg font-semibold text-ink">
              <Amount value={total} />
            </span>
          </div>

          {transactions.length === 0 ? (
            <p className="text-muted text-sm">Nothing to show.</p>
          ) : (
            <Table className="table-fixed">
              <THead>
                <tr>
                  <TH className="w-[26%]">Date</TH>
                  <TH className="w-[48%]">Merchant</TH>
                  <TH align="right" className="w-[26%]">Amount</TH>
                </tr>
              </THead>
              <tbody>
                {transactions.map((t) => (
                  <TR key={t.id}>
                    <TD className="text-ink whitespace-nowrap tnum">{formatDate(t.date)}</TD>
                    <TD>
                      <span className="block truncate text-ink">{t.merchant || "—"}</span>
                      {sourceName(t.sourceKey) && (
                        <span className="block truncate text-xs text-muted">
                          {sourceName(t.sourceKey)}
                        </span>
                      )}
                      {/* The roll-up row covers several categories, so each row
                          says which one it is. */}
                      {row.rolledUp && (
                        <span className="block truncate text-xs text-muted">{t.category}</span>
                      )}
                    </TD>
                    <TD align="right">
                      {/* A refund is negative spending: show it as a credit. */}
                      <Amount value={t.cents / 100} tone={t.cents < 0 ? "green" : "default"} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      )}
    </SlideOver>
  );
}
