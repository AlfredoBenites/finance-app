import { useEffect, useMemo, useState } from "react";
import { transactionsApi, profilesApi, creditCardsApi } from "../../api/client";
import { SlideOver, Banner, Badge, Amount, CardArt, Button, cn } from "../ui";
import { useSettings } from "../../settings/SettingsContext";

// Guess the card network from its name/issuer for the unambiguous brands. The
// data model has no network field yet, so this is best-effort; ambiguous cards
// (could be Visa or Mastercard) just show no network.
function inferNetwork(card) {
  const s = `${card?.name || ""} ${card?.issuer || ""}`.toLowerCase();
  if (/amex|american express/.test(s)) return "AMEX";
  if (/discover/.test(s)) return "DISCOVER";
  if (/mastercard|master card/.test(s)) return "MASTERCARD";
  if (/visa/.test(s)) return "VISA";
  return null;
}

// Slide-over for a card on the dashboard: its charges grouped by profile, each
// showing paid/reimbursed status. Defaults to showing only what's still open
// (unpaid by me / not reimbursed by others). Paginated so heavily-used cards
// with thousands of charges don't lag the panel.
export default function CardDetailPanel({ cardId, cardName, open, onClose }) {
  const [txns, setTxns] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [cardInfo, setCardInfo] = useState(null);
  const [error, setError] = useState(null);
  const [openOnly, setOpenOnly] = useState(true); // unpaid / not reimbursed
  const [page, setPage] = useState(0);
  const { cardTxnPageSize } = useSettings();
  const pageSize = cardTxnPageSize || 20;

  useEffect(() => {
    if (!cardId) return;
    let cancelled = false;
    setTxns(null);
    setError(null);
    setOpenOnly(true);
    setPage(0);
    Promise.all([
      transactionsApi.list({ credit_card_id: cardId }),
      profilesApi.list(),
      creditCardsApi.list(),
    ])
      .then(([t, p, cards]) => {
        if (cancelled) return;
        setTxns(t);
        setProfiles(p);
        setCardInfo(cards.find((c) => c.id === cardId) || null);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  // Reset to the first page whenever the view or page size changes.
  useEffect(() => {
    setPage(0);
  }, [openOnly, pageSize]);

  const primaryId = profiles.find((p) => p.is_primary)?.id;
  const profileName = (id) => profiles.find((p) => p.id === id)?.name ?? "Unknown";

  // Total still-open per profile (across ALL charges, not just this page), so the
  // group headers stay stable as you page through.
  const openByProfile = useMemo(() => {
    const m = new Map();
    (txns || [])
      .filter((t) => !t.is_paid_back)
      .forEach((t) => m.set(t.profile_id, (m.get(t.profile_id) || 0) - Number(t.amount)));
    return m;
  }, [txns]);

  // Filtered + sorted newest-first, then the current page, then grouped by
  // profile (primary first) for display.
  const filtered = useMemo(() => {
    if (!txns) return [];
    const v = openOnly ? txns.filter((t) => !t.is_paid_back) : txns;
    return [...v].sort((a, b) =>
      a.transaction_date < b.transaction_date ? 1 : a.transaction_date > b.transaction_date ? -1 : 0
    );
  }, [txns, openOnly]);

  const total = filtered.length;
  const start = page * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);

  const groups = useMemo(() => {
    const byProfile = new Map();
    for (const t of pageItems) {
      if (!byProfile.has(t.profile_id)) byProfile.set(t.profile_id, []);
      byProfile.get(t.profile_id).push(t);
    }
    return [...byProfile.entries()]
      .map(([pid, items]) => ({ pid, name: profileName(pid), items }))
      .sort((a, b) =>
        a.pid === primaryId ? -1 : b.pid === primaryId ? 1 : a.name.localeCompare(b.name)
      );
  }, [pageItems, profiles]);

  function statusBadge(t) {
    const own = t.profile_id === primaryId;
    if (t.is_paid_back) return <Badge tone="success">{own ? "Paid" : "Reimbursed"}</Badge>;
    return <Badge tone="orange">{own ? "Unpaid" : "Not reimbursed"}</Badge>;
  }

  return (
    <SlideOver open={open} onClose={onClose} title={cardInfo?.name || cardName || "Card"} subtitle="Charges by profile">
      {error && <Banner tone="danger">{error}</Banner>}
      {!txns && !error && <p className="text-muted text-sm">Loading…</p>}

      {txns && (
        <div className="space-y-5">
          {cardInfo && (
            <CardArt
              name={cardInfo.name}
              network={cardInfo.network || inferNetwork(cardInfo)}
              lastFour={cardInfo.last_four}
              color={cardInfo.color}
              size="lg"
            />
          )}

          {/* Filter: open vs all */}
          <div className="inline-flex rounded-md border border-border p-0.5 text-sm">
            {[
              [true, "Unpaid / not reimbursed"],
              [false, "All"],
            ].map(([val, label]) => (
              <button
                key={label}
                onClick={() => setOpenOnly(val)}
                className={cn(
                  "px-3 py-1 rounded transition-colors",
                  openOnly === val ? "bg-surface-muted text-ink font-medium" : "text-muted hover:text-ink"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {total === 0 ? (
            <p className="text-muted text-sm">
              {openOnly ? "Nothing open on this card. 🎉" : "No charges on this card."}
            </p>
          ) : (
            <>
              {groups.map((g) => {
                const owed = openByProfile.get(g.pid) || 0;
                return (
                  <section key={g.pid}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-ink">{g.name}</h3>
                      {owed > 0.005 && (
                        <strong>
                          <Amount value={owed} tone="danger" />{" "}
                          <span className="text-xs text-muted">open</span>
                        </strong>
                      )}
                    </div>
                    <ul className="divide-y divide-border border border-border rounded-lg">
                      {g.items.map((t) => (
                        <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <span className="min-w-0">
                            <span className="text-ink">{t.merchant || "—"}</span>
                            <span className="text-muted">
                              {" "}
                              · {t.transaction_date}
                              {t.category ? ` · ${t.category}` : ""}
                            </span>
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            {statusBadge(t)}
                            <Amount value={t.amount} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}

              {/* Pagination (page size will be configurable in Settings) */}
              {total > pageSize && (
                <div className="flex items-center justify-between gap-3 pt-1 text-sm">
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
        </div>
      )}
    </SlideOver>
  );
}
