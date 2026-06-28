import { useEffect, useState } from "react";
import { profilesApi } from "../../api/client";
import { SlideOver, Banner, Amount } from "../ui";

// Slide-over for a profile on the dashboard: what this person still owes,
// grouped by card (highest first), with the unpaid charges behind each total.
// Reuses the existing /statement endpoint — no backend change.
export default function ProfileDetailPanel({ profileId, open, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    setData(null);
    setError(null);
    profilesApi
      .statement(profileId)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={data?.profile_name || "Profile"}
      subtitle="Still owed, by card"
    >
      {error && <Banner tone="danger">{error}</Banner>}
      {!data && !error && <p className="text-muted text-sm">Loading…</p>}

      {data && (
        <div className="space-y-5">
          <div className="flex items-baseline justify-between border-b border-border pb-4">
            <span className="text-sm text-muted">Total still owed</span>
            <span className="text-2xl font-semibold">
              <Amount value={data.total_owed} tone="danger" />
            </span>
          </div>

          {data.cards.length === 0 ? (
            <p className="text-muted text-sm">Nothing currently owed. 🎉</p>
          ) : (
            data.cards.map((c) => (
              <section key={c.card_name}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-ink">{c.card_name}</h3>
                  <strong>
                    <Amount value={c.owed} tone="danger" />
                  </strong>
                </div>
                <ul className="divide-y divide-border border border-border rounded-lg">
                  {c.transactions.map((t, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="text-ink">{t.merchant || "—"}</span>
                        <span className="text-muted">
                          {" "}
                          · {t.transaction_date}
                          {t.category ? ` · ${t.category}` : ""}
                        </span>
                        {t.notes ? (
                          <span className="block text-xs text-muted truncate">📝 {t.notes}</span>
                        ) : null}
                      </span>
                      <Amount value={-t.amount} />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      )}
    </SlideOver>
  );
}
