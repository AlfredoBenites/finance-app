import { useEffect, useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { dashboardApi } from "../../api/client";
import { SlideOver, Banner, Amount, cn } from "../ui";

// Shared loader: fetch the breakdown once whenever a panel opens.
function useBreakdown(open) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setData(null);
    setError(null);
    dashboardApi
      .breakdown()
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [open]);
  return { data, error };
}

// One line in a breakdown: label on the left, amount on the right. `op` shows a
// leading +/− so the math reads like an equation.
function Row({ label, value, op, tone, strong, indent }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 py-1.5",
        indent && "pl-3 text-muted text-sm",
        strong && "border-t border-border pt-3 mt-1"
      )}
    >
      <span className={cn(strong ? "font-semibold text-ink" : indent ? "" : "text-ink")}>
        {label}
      </span>
      <span className={cn("flex items-center gap-1", strong && "text-lg")}>
        {op && <span className="text-muted">{op}</span>}
        <Amount value={value} tone={tone} />
      </span>
    </div>
  );
}

function SubList({ items, valueKey = "amount" }) {
  if (!items?.length) return null;
  return (
    <div className="mb-2">
      {items.map((it, i) => (
        <Row key={i} label={it.name || "Unknown"} value={it[valueKey]} indent />
      ))}
    </div>
  );
}

export function RealAvailablePanel({ open, onClose }) {
  const { data, error } = useBreakdown(open);
  const ra = data?.real_available;
  const [showDetails, setShowDetails] = useState(false);
  // Available cash = liquid minus everything set aside; subtracting your own
  // unallocated debt then lands on the real-available total.
  const availableCash = ra ? ra.total + ra.my_unallocated_debt : 0;
  return (
    <SlideOver open={open} onClose={onClose} title="Real available money" subtitle="What's actually free to spend right now">
      {error && <Banner tone="danger">{error}</Banner>}
      {!data && !error && <p className="text-muted text-sm">Loading…</p>}
      {ra && (
        <div>
          {/* Simplified formula, with where each side comes from */}
          <Row label="Available cash" value={availableCash} op="+" />
          {ra.available_sources?.map((acc, i) => (
            <div key={i}>
              <Row label={acc.name} value={acc.amount} indent />
              {acc.sources?.map((s, j) => (
                <div key={j} className="flex items-center justify-between gap-3 pl-6 py-0.5 text-xs text-muted">
                  <span>{s.name}</span>
                  <Amount value={s.amount} />
                </div>
              ))}
            </div>
          ))}
          <Row label="Unallocated card debt" value={ra.my_unallocated_debt} op="−" tone="danger" />
          <SubList items={ra.debt_by_card} />
          <Row label="Real available money" value={ra.total} strong />

          {/* Full math, collapsed by default */}
          <button
            onClick={() => setShowDetails((v) => !v)}
            className="mt-4 flex items-center gap-1 text-sm text-muted hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          >
            {showDetails ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            {showDetails ? "Hide the full breakdown" : "Show the full breakdown"}
          </button>

          {showDetails && (
            <div className="mt-3 border-t border-border pt-3">
              <Row label="Liquid cash" value={ra.liquid_cash} op="+" />
              <SubList items={ra.accounts} valueKey="balance" />
              <Row label="Saved in card buckets" value={ra.card_buckets} op="−" tone="danger" />
              <SubList items={ra.card_bucket_list} />
              <Row label="Set aside in other buckets" value={ra.set_aside_buckets} op="−" tone="danger" />
              <SubList items={ra.bucket_list} />
              <Row label="My unallocated card debt" value={ra.my_unallocated_debt} op="−" tone="danger" />
              <Row label="Real available money" value={ra.total} strong />
              <p className="text-xs text-muted mt-4">
                Liquid cash (checking, savings, cash), minus everything already saved in card payoff
                buckets (that cash is earmarked to pay cards and may include reimbursements other
                people gave you), minus money set aside in other buckets, minus your own charges you
                haven't set aside money for yet.
              </p>
            </div>
          )}
        </div>
      )}
    </SlideOver>
  );
}

export function NetWorthPanel({ open, onClose }) {
  const { data, error } = useBreakdown(open);
  const nw = data?.net_worth;
  return (
    <SlideOver open={open} onClose={onClose} title="Net worth" subtitle="Everything you own minus everything you owe">
      {error && <Banner tone="danger">{error}</Banner>}
      {!data && !error && <p className="text-muted text-sm">Loading…</p>}
      {nw && (
        <div>
          <Row label="Total assets" value={nw.total_assets} op="+" tone="green" />
          <SubList items={nw.assets} valueKey="balance" />
          <Row label="Credit card debt" value={nw.card_debt} op="−" tone="danger" />
          {nw.other_liabilities > 0.005 && (
            <Row label="Other liabilities" value={nw.other_liabilities} op="−" tone="danger" />
          )}
          {nw.not_mine_buckets > 0.005 && (
            <Row label="Cash held for others" value={nw.not_mine_buckets} op="−" tone="danger" />
          )}
          <Row label="Net worth" value={nw.total} strong />
          <p className="text-xs text-muted mt-4">
            Assets (bank, cash, investments) minus what you owe the bank and any other debts. Buckets
            you own don't reduce net worth, since that money is still yours, but cash you're holding
            for someone else is subtracted.
          </p>
        </div>
      )}
    </SlideOver>
  );
}

export function CashbackPanel({ open, onClose }) {
  const { data, error } = useBreakdown(open);
  const cb = data?.cashback;
  return (
    <SlideOver open={open} onClose={onClose} title="Cashback" subtitle="Total earned, by person and card">
      {error && <Banner tone="danger">{error}</Banner>}
      {!data && !error && <p className="text-muted text-sm">Loading…</p>}
      {cb && (
        <div className="space-y-6">
          <Row label="Total cashback" value={cb.total} strong tone="green" />

          <section>
            <h3 className="font-medium text-ink mb-2">By card</h3>
            {cb.by_card.length === 0 ? (
              <p className="text-sm text-muted">No cashback yet.</p>
            ) : (
              <div className="space-y-2">
                {cb.by_card.map((c, i) => (
                  <div key={i} className="border border-border rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between gap-3 px-3 py-2 bg-surface-muted">
                      <span className="font-medium text-ink">{c.name}</span>
                      <Amount value={c.amount} tone="green" />
                    </div>
                    <ul className="divide-y divide-border">
                      {c.profiles.map((p, j) => (
                        <li key={j} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                          <span className="text-muted">{p.name}</span>
                          <Amount value={p.amount} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="font-medium text-ink mb-2">By person</h3>
            {cb.by_profile.length === 0 ? (
              <p className="text-sm text-muted">No cashback yet.</p>
            ) : (
              <ul className="divide-y divide-border border border-border rounded-lg">
                {cb.by_profile.map((p, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="text-ink">{p.name}</span>
                    <Amount value={p.amount} tone="green" />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-xs text-muted">
            All cashback accrued on your charges. This is what your cards earned you. It won't always
            match each issuer's site exactly, since issuers credit cashback on different schedules.
          </p>
        </div>
      )}
    </SlideOver>
  );
}
