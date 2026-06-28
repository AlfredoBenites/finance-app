import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  PieChart,
  CreditCard,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
} from "lucide-react";
import { Modal, Button, Input, Toggle, ReorderList, cn } from "./ui";
import { useSettings } from "../settings/SettingsContext";
import { profilesApi, creditCardsApi } from "../api/client";

const CATEGORIES = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["insights", "Insights", PieChart],
  ["cards", "Credit Cards", CreditCard],
];

const SORT_MODES = [
  ["desc", "Highest balance first", ArrowDownWideNarrow],
  ["asc", "Lowest balance first", ArrowUpNarrowWide],
];
const PAGE_PRESETS = [20, 50, 100];

// Order an array of {id} by a saved list of ids; anything not listed goes last.
function applyOrder(items, order) {
  const set = new Set(order || []);
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  const inOrder = (order || []).map((id) => byId[id]).filter(Boolean);
  const rest = items.filter((i) => !set.has(i.id));
  return [...inOrder, ...rest];
}

function Section({ title, hint, children }) {
  return (
    <section className="py-4 first:pt-0 border-b border-border last:border-0">
      <h3 className="font-medium text-ink">{title}</h3>
      {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

// A single toggle setting as a bordered row, so the control reads clearly as a
// distinct setting (not just text next to a switch).
function ToggleRow({ label, hint, on, onClick }) {
  return (
    <div className="flex items-start justify-between gap-4 border border-border rounded-lg px-3 py-3">
      <div>
        <div className="text-sm text-ink">{label}</div>
        {hint && <div className="text-xs text-muted mt-0.5">{hint}</div>}
      </div>
      <Toggle on={on} onClick={onClick} />
    </div>
  );
}

// A segmented choice (like the page-size presets), used for small either/or prefs.
function Segmented({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-md border border-border-strong p-0.5">
      {options.map(([val, label]) => (
        <button
          key={val}
          onClick={() => onChange(val)}
          className={cn(
            "px-3 h-8 rounded text-sm transition-colors",
            value === val ? "bg-control text-ink font-medium" : "text-muted hover:text-ink"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsModal() {
  const {
    isOpen,
    close,
    profileSort,
    setProfileSort,
    cardTxnPageSize,
    setCardTxnPageSize,
    cardOrder,
    setCardOrder,
    dashboardPrefs,
    setDashboardPrefs,
  } = useSettings();
  const setPref = (key, value) => setDashboardPrefs({ ...dashboardPrefs, [key]: value });

  const [tab, setTab] = useState("dashboard");
  const [profiles, setProfiles] = useState([]);
  const [cards, setCards] = useState([]);

  useEffect(() => {
    if (!isOpen) return;
    profilesApi.list().then(setProfiles).catch(() => {});
    creditCardsApi.list().then((cs) => setCards(cs.filter((c) => c.is_active !== false))).catch(() => {});
  }, [isOpen]);

  const orderedProfiles = useMemo(() => applyOrder(profiles, profileSort.order), [profiles, profileSort.order]);
  const orderedCards = useMemo(() => applyOrder(cards, cardOrder), [cards, cardOrder]);

  function setMode(mode) {
    if (mode === "custom") {
      const order = profileSort.order?.length ? profileSort.order : profiles.map((p) => p.id);
      setProfileSort({ mode, order });
    } else {
      setProfileSort({ ...profileSort, mode });
    }
  }

  function setPageSize(v) {
    setCardTxnPageSize(Math.max(1, Math.min(100, Number(v) || 1)));
  }

  return (
    <Modal
      open={isOpen}
      onClose={close}
      title="Settings"
      subtitle="Preferences are saved on this device."
      width="max-w-3xl"
      height="h-[560px] max-h-[85vh]"
    >
      <div className="flex flex-col sm:flex-row gap-5">
        {/* Category nav: horizontal on mobile, left rail on desktop */}
        <nav className="flex sm:flex-col gap-1 sm:w-44 shrink-0 overflow-x-auto">
          {CATEGORIES.map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm whitespace-nowrap transition-colors",
                tab === key ? "bg-control text-ink font-medium" : "text-muted hover:bg-surface-muted hover:text-ink"
              )}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>

        <div className="flex-1 min-w-0">
          {tab === "dashboard" && (
            <>
              <Section title="Cashback on the dashboard" hint="Which cashback total the Summary shows.">
                <Segmented
                  value={dashboardPrefs.cashbackScope || "all"}
                  onChange={(v) => setPref("cashbackScope", v)}
                  options={[
                    ["all", "All cashback"],
                    ["mine", "My cashback only"],
                  ]}
                />
              </Section>

              <Section title="Card balances" hint="What counts toward the Unallocated Balance by Card.">
                <ToggleRow
                  label="Only my debt"
                  hint="Count only your own profile's charges, not other people's spending on your cards."
                  on={dashboardPrefs.onlyMyDebt}
                  onClick={() => setPref("onlyMyDebt", !dashboardPrefs.onlyMyDebt)}
                />
              </Section>

              <Section title="Profile order" hint="How the Unallocated Balance by Profile list is sorted.">
                <div className="inline-flex rounded-md border border-border-strong p-0.5">
                  {SORT_MODES.map(([mode, label, Icon]) => (
                    <button
                      key={mode}
                      onClick={() => setMode(mode)}
                      title={label}
                      aria-label={label}
                      className={cn(
                        "grid place-items-center h-8 w-9 rounded transition-colors",
                        profileSort.mode === mode ? "bg-control text-ink" : "text-muted hover:text-ink"
                      )}
                    >
                      <Icon size={16} />
                    </button>
                  ))}
                  <button
                    onClick={() => setMode("custom")}
                    className={cn(
                      "px-3 h-8 rounded text-sm transition-colors",
                      profileSort.mode === "custom" ? "bg-control text-ink font-medium" : "text-muted hover:text-ink"
                    )}
                  >
                    Custom
                  </button>
                </div>

                {profileSort.mode === "custom" && (
                  <div className="mt-3">
                    {orderedProfiles.length === 0 ? (
                      <p className="text-sm text-muted">No profiles yet.</p>
                    ) : (
                      <ReorderList
                        items={orderedProfiles}
                        onReorder={(next) => setProfileSort({ mode: "custom", order: next.map((p) => p.id) })}
                        renderLabel={(p) => p.name}
                      />
                    )}
                  </div>
                )}
              </Section>

              <Section
                title="Card transactions per page"
                hint="How many charges load at once when you open a card's detail panel (max 100)."
              >
                <div className="flex items-center gap-2 flex-wrap">
                  {PAGE_PRESETS.map((n) => (
                    <Button
                      key={n}
                      size="sm"
                      variant={cardTxnPageSize === n ? "primary" : "secondary"}
                      onClick={() => setPageSize(n)}
                    >
                      {n}
                    </Button>
                  ))}
                  <span className="text-sm text-muted ml-1">Custom:</span>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={cardTxnPageSize}
                    onChange={(e) => setPageSize(e.target.value)}
                    className="w-20"
                  />
                </div>
              </Section>
            </>
          )}

          {tab === "insights" && (
            <Section title="Income" hint="How income totals are figured on the Insights page.">
              <ToggleRow
                label="Hide repayments from income"
                hint="Leave out money people paid you back when totaling income."
                on={dashboardPrefs.hideRepayments}
                onClick={() => setPref("hideRepayments", !dashboardPrefs.hideRepayments)}
              />
            </Section>
          )}

          {tab === "cards" && (
            <Section title="Credit card display order" hint="Drag to set the order your cards appear on the Credit Cards page.">
              {orderedCards.length === 0 ? (
                <p className="text-sm text-muted">No cards yet.</p>
              ) : (
                <ReorderList
                  items={orderedCards}
                  onReorder={(next) => setCardOrder(next.map((c) => c.id))}
                  renderLabel={(c) => c.name}
                />
              )}
            </Section>
          )}
        </div>
      </div>
    </Modal>
  );
}
