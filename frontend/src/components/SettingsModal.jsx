import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  PieChart,
  CreditCard,
  Receipt,
  Banknote,
  PiggyBank,
  Landmark,
  Wallet,
  TrendingUp,
  Users,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  ChevronRight,
} from "lucide-react";
import { Modal, Button, Input, Select, Toggle, ReorderList, cn } from "./ui";
import { KindBadge, TAG_COLORS } from "./buckets/tagColors";
import { BucketIcon, BUCKET_COLORS } from "./buckets/bucketIcons";
import { useSettings, REFUNDS } from "../settings/SettingsContext";
import { YEARS } from "../components/YearSelect";
import { profilesApi, creditCardsApi, accountsApi, bucketsApi } from "../api/client";

const CATEGORIES = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["insights", "Insights", PieChart],
  ["cards", "Credit Cards", CreditCard],
  ["buckets", "Buckets", PiggyBank],
  ["payments", "Pay a card", Landmark],
  ["accounts", "Accounts", Wallet],
  ["investments", "Investments", TrendingUp],
  ["expenses", "Expenses", Receipt],
  ["income", "Income", Banknote],
  ["shared", "Shared with me", Users],
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
    accountOrder,
    setAccountOrder,
    moveHistoryPerPage,
    setMoveHistoryPerPage,
    kindColors,
    setKindColors,
    expensesPerPage,
    setExpensesPerPage,
    expensesFilters,
    setExpensesFilters,
    incomePerPage,
    setIncomePerPage,
    paymentsPerPage,
    setPaymentsPerPage,
    sharedPerPage,
    setSharedPerPage,
    transferHistoryPerPage,
    setTransferHistoryPerPage,
    investmentHistoryPerPage,
    setInvestmentHistoryPerPage,
    cardIconColors,
    setCardIconColors,
    dashboardPrefs,
    setDashboardPrefs,
  } = useSettings();
  const setPref = (key, value) => setDashboardPrefs({ ...dashboardPrefs, [key]: value });
  const setExpFilter = (key, value) => setExpensesFilters({ ...expensesFilters, [key]: value });

  const [tab, setTab] = useState("dashboard");
  const [profiles, setProfiles] = useState([]);
  const [cards, setCards] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [buckets, setBuckets] = useState([]);
  const [acctOrderOpen, setAcctOrderOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    profilesApi.list().then(setProfiles).catch(() => {});
    creditCardsApi.list().then((cs) => setCards(cs.filter((c) => c.is_active !== false))).catch(() => {});
    accountsApi.list().then(setAccounts).catch(() => {});
    bucketsApi.list().then(setBuckets).catch(() => {});
  }, [isOpen]);

  const orderedProfiles = useMemo(() => applyOrder(profiles, profileSort.order), [profiles, profileSort.order]);
  const orderedCards = useMemo(() => applyOrder(cards, cardOrder), [cards, cardOrder]);
  // Accounts that actually hold buckets, in the saved display order.
  const bucketAccounts = useMemo(
    () => applyOrder(accounts.filter((a) => buckets.some((b) => b.account_id === a.id)), accountOrder),
    [accounts, buckets, accountOrder]
  );

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

          {tab === "buckets" && (
            <>
              {/* Account Order — collapsible so the list only shows when wanted. */}
              <section className="py-4 first:pt-0 border-b border-border">
                <button
                  onClick={() => setAcctOrderOpen((o) => !o)}
                  className="flex items-center gap-1.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                >
                  <ChevronRight size={16} className={cn("text-muted transition-transform", acctOrderOpen && "rotate-90")} />
                  <h3 className="font-medium text-ink">Account Order</h3>
                </button>
                <p className="text-xs text-muted mt-0.5 ml-[22px]">
                  Drag to set the order accounts appear on the Buckets page.
                </p>
                {acctOrderOpen && (
                  <div className="mt-3 ml-[22px]">
                    {bucketAccounts.length === 0 ? (
                      <p className="text-sm text-muted">No accounts with buckets yet.</p>
                    ) : (
                      <ReorderList
                        items={bucketAccounts}
                        onReorder={(next) => setAccountOrder(next.map((a) => a.id))}
                        renderLabel={(a) => a.name}
                      />
                    )}
                  </div>
                )}
              </section>

              <Section title="Kind tag colors" hint="Colors for the bucket kind tags on the Buckets page. (Bucket order now lives in each account's panel.)">
                <div className="space-y-3">
                  {[
                    ["card", "Credit card"],
                    ["spendable", "Mine › Spendable"],
                    ["set_aside", "Mine › Set Aside"],
                    ["not_mine", "Not Mine › Holding"],
                  ].map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between gap-3 flex-wrap">
                      <KindBadge colorKey={kindColors[key]}>{label}</KindBadge>
                      <div className="flex flex-wrap gap-1.5">
                        {TAG_COLORS.map(([ck, cl, hex]) => (
                          <button
                            key={ck}
                            type="button"
                            title={cl}
                            aria-label={cl}
                            onClick={() => setKindColors({ ...kindColors, [key]: ck })}
                            className={cn(
                              "h-6 w-6 rounded-full border-2 transition-transform",
                              kindColors[key] === ck ? "border-ink scale-110" : "border-transparent"
                            )}
                            style={{ backgroundColor: hex }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Move history rows per page" hint="How many moves show per page (max 100).">
                <div className="flex items-center gap-2 flex-wrap">
                  {[15, 25, 50].map((n) => (
                    <Button
                      key={n}
                      size="sm"
                      variant={moveHistoryPerPage === n ? "primary" : "secondary"}
                      onClick={() => setMoveHistoryPerPage(n)}
                    >
                      {n}
                    </Button>
                  ))}
                  <span className="text-sm text-muted ml-1">Custom:</span>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={moveHistoryPerPage}
                    onChange={(e) => setMoveHistoryPerPage(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                    className="w-20"
                  />
                </div>
              </Section>
            </>
          )}

          {tab === "expenses" && (
            <>
              <Section title="Rows per page" hint="How many expenses show at once (max 100).">
                <div className="flex items-center gap-2 flex-wrap">
                  {[15, 25, 35].map((n) => (
                    <Button
                      key={n}
                      size="sm"
                      variant={expensesPerPage === n ? "primary" : "secondary"}
                      onClick={() => setExpensesPerPage(n)}
                    >
                      {n}
                    </Button>
                  ))}
                  <span className="text-sm text-muted ml-1">Custom:</span>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={expensesPerPage}
                    onChange={(e) => setExpensesPerPage(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                    className="w-20"
                  />
                </div>
              </Section>

              <Section title="Default filters" hint="How the Expenses filters start when you open the page.">
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted">Profile</span>
                    <Select value={expensesFilters.profile_id} onChange={(e) => setExpFilter("profile_id", e.target.value)}>
                      <option value="">All profiles</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </Select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted">Status</span>
                    <Select value={expensesFilters.is_paid_back} onChange={(e) => setExpFilter("is_paid_back", e.target.value)}>
                      <option value="">Paid + unpaid</option>
                      <option value="false">Unpaid only</option>
                      <option value="true">Paid only</option>
                      <option value={REFUNDS}>Refunds only</option>
                    </Select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted">Source</span>
                    <Select value={expensesFilters.source} onChange={(e) => setExpFilter("source", e.target.value)}>
                      <option value="">All sources</option>
                      <optgroup label="Credit cards">
                        {cards.map((c) => (
                          <option key={c.id} value={`card:${c.id}`}>{c.name}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Accounts (bank / cash)">
                        {accounts.map((a) => (
                          <option key={a.id} value={`account:${a.id}`}>{a.name}</option>
                        ))}
                      </optgroup>
                    </Select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted">Period</span>
                    <Select value={expensesFilters.year} onChange={(e) => setExpFilter("year", e.target.value)}>
                      <option value="current">This year</option>
                      {YEARS.map((y) => (
                        <option key={y} value={String(y)}>{y}</option>
                      ))}
                      <option value="all">All time</option>
                    </Select>
                  </label>
                </div>
              </Section>
            </>
          )}

          {tab === "income" && (
            <Section title="Rows per page" hint="How many income entries show at once (max 100).">
              <div className="flex items-center gap-2 flex-wrap">
                {[15, 25, 35].map((n) => (
                  <Button
                    key={n}
                    size="sm"
                    variant={incomePerPage === n ? "primary" : "secondary"}
                    onClick={() => setIncomePerPage(n)}
                  >
                    {n}
                  </Button>
                ))}
                <span className="text-sm text-muted ml-1">Custom:</span>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={incomePerPage}
                  onChange={(e) => setIncomePerPage(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                  className="w-20"
                />
              </div>
            </Section>
          )}

          {tab === "shared" && (
            <Section title="Rows per page" hint="How many shared charges show at once (max 100).">
              <div className="flex items-center gap-2 flex-wrap">
                {[15, 25, 35].map((n) => (
                  <Button
                    key={n}
                    size="sm"
                    variant={sharedPerPage === n ? "primary" : "secondary"}
                    onClick={() => setSharedPerPage(n)}
                  >
                    {n}
                  </Button>
                ))}
                <span className="text-sm text-muted ml-1">Custom:</span>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={sharedPerPage}
                  onChange={(e) => setSharedPerPage(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                  className="w-20"
                />
              </div>
            </Section>
          )}

          {tab === "payments" && (
            <>
              <Section title="Payment history rows per page" hint="How many payments show per page (max 100).">
                <div className="flex items-center gap-2 flex-wrap">
                  {[25, 50, 100].map((n) => (
                    <Button
                      key={n}
                      size="sm"
                      variant={paymentsPerPage === n ? "primary" : "secondary"}
                      onClick={() => setPaymentsPerPage(n)}
                    >
                      {n}
                    </Button>
                  ))}
                  <span className="text-sm text-muted ml-1">Custom:</span>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={paymentsPerPage}
                    onChange={(e) => setPaymentsPerPage(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                    className="w-20"
                  />
                </div>
              </Section>

              <Section title="Card icon colors" hint="Color for each card's icon in the Pay a card table.">
                {cards.length === 0 ? (
                  <p className="text-sm text-muted">No cards yet.</p>
                ) : (
                  <div className="space-y-3">
                    {cards.map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-3 flex-wrap">
                        <span className="inline-flex items-center gap-2 text-sm text-ink">
                          <BucketIcon icon="credit-card" color={cardIconColors[c.id]} />
                          {c.name}
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            title="No color"
                            onClick={() => setCardIconColors({ ...cardIconColors, [c.id]: null })}
                            className={cn("h-6 w-6 rounded-full border-2", !cardIconColors[c.id] ? "border-ink" : "border-border")}
                          />
                          {BUCKET_COLORS.map(([ck, cl, hex]) => (
                            <button
                              key={ck}
                              type="button"
                              title={cl}
                              aria-label={cl}
                              onClick={() => setCardIconColors({ ...cardIconColors, [c.id]: ck })}
                              className={cn(
                                "h-6 w-6 rounded-full border-2 transition-transform",
                                cardIconColors[c.id] === ck ? "border-ink scale-110" : "border-transparent"
                              )}
                              style={{ backgroundColor: hex }}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </>
          )}

          {tab === "accounts" && (
            <>
              <Section title="Transfer history rows per page" hint="How many transfers show per page (max 100).">
                <div className="flex items-center gap-2 flex-wrap">
                  {[10, 25, 50].map((n) => (
                    <Button
                      key={n}
                      size="sm"
                      variant={transferHistoryPerPage === n ? "primary" : "secondary"}
                      onClick={() => setTransferHistoryPerPage(n)}
                    >
                      {n}
                    </Button>
                  ))}
                  <span className="text-sm text-muted ml-1">Custom:</span>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={transferHistoryPerPage}
                    onChange={(e) => setTransferHistoryPerPage(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                    className="w-20"
                  />
                </div>
              </Section>
            </>
          )}

          {tab === "investments" && (
            <>
              <Section title="Purchase history rows per page" hint="How many buys show per page (max 100).">
                <div className="flex items-center gap-2 flex-wrap">
                  {[10, 25, 50].map((n) => (
                    <Button
                      key={n}
                      size="sm"
                      variant={investmentHistoryPerPage === n ? "primary" : "secondary"}
                      onClick={() => setInvestmentHistoryPerPage(n)}
                    >
                      {n}
                    </Button>
                  ))}
                  <span className="text-sm text-muted ml-1">Custom:</span>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={investmentHistoryPerPage}
                    onChange={(e) => setInvestmentHistoryPerPage(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                    className="w-20"
                  />
                </div>
              </Section>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
