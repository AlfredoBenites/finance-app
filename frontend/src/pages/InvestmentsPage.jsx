import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { holdingsApi, accountsApi, bucketsApi } from "../api/client";
import { formatDate, todayLocal } from "../format";
import { useSettings } from "../settings/SettingsContext";
import {
  PageHeader,
  Card,
  Button,
  Badge,
  Banner,
  StatCard,
  Amount,
  Field,
  Input,
  Select,
  DateInput,
  Table,
  THead,
  TH,
  TR,
  TD,
} from "../components/ui";
import HoldingDetailPanel from "../components/investments/HoldingDetailPanel";

const EMPTY = { account_id: "", symbol: "", kind: "stock", category: "", shares: "", manual_price: "" };
const EMPTY_BUY = { account_id: "", bucket_id: "", symbol: "", kind: "stock", category: "", shares: "", price: "", total: "" };

const KINDS = [
  ["stock", "Stock / ETF"],
  ["crypto", "Crypto"],
];

// Fractional shares + tiny crypto prices, so show up to 6 decimals (not cents).
const priceStr = (n) =>
  n == null ? "—" : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 6 })}`;

const effPrice = (h) => (h.manual_price != null ? h.manual_price : h.last_price);
const holdingValue = (h) => (effPrice(h) == null ? null : Number(h.shares) * Number(effPrice(h)));

export default function InvestmentsPage() {
  const [holdings, setHoldings] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [buckets, setBuckets] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [buy, setBuy] = useState({ ...EMPTY_BUY, traded_on: todayLocal() });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [histPage, setHistPage] = useState(0);

  // Edit panel — keep the id set through the close animation.
  const [panelHoldingId, setPanelHoldingId] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const { investmentHistoryPerPage } = useSettings();
  const accountName = (id) => accounts.find((a) => a.id === id)?.name ?? "Unassigned";

  async function load() {
    try {
      const [h, a, b, t] = await Promise.all([
        holdingsApi.list(),
        accountsApi.list(),
        bucketsApi.list(),
        holdingsApi.transactions(),
      ]);
      setHoldings(h);
      setAccounts(a);
      setBuckets(b);
      setTransactions(t);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setHistPage(0);
  }, [investmentHistoryPerPage]);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setBuyField = (k, v) => setBuy((b) => ({ ...b, [k]: v }));

  async function handleBuy(e) {
    e.preventDefault();
    if (!buy.account_id || !buy.symbol.trim() || buy.shares === "" || (buy.price === "" && buy.total === "")) {
      setError("Account, symbol, shares, and a price or total are required to buy.");
      return;
    }
    try {
      await holdingsApi.buy({
        account_id: buy.account_id,
        bucket_id: buy.bucket_id || null,
        symbol: buy.symbol.trim().toUpperCase(),
        kind: buy.kind,
        category: buy.category.trim() || null,
        shares: Number(buy.shares),
        price: buy.price === "" ? null : Number(buy.price),
        amount: buy.total === "" ? null : Number(buy.total),
        traded_on: buy.traded_on || null,
      });
      setBuy({ ...EMPTY_BUY, traded_on: todayLocal() });
      setError(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.account_id || !form.symbol.trim() || form.shares === "") {
      setError("Account, symbol, and shares are required.");
      return;
    }
    try {
      await holdingsApi.create({
        account_id: form.account_id,
        symbol: form.symbol.trim().toUpperCase(),
        kind: form.kind,
        category: form.category.trim() || null,
        shares: Number(form.shares),
        manual_price: form.manual_price === "" ? null : Number(form.manual_price),
      });
      setForm(EMPTY);
      setError(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function refresh() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await holdingsApi.refreshPrices();
      setError(
        r.updated < r.total
          ? `Updated ${r.updated} of ${r.total} (some symbols had no price — set a manual price).`
          : null
      );
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function openPanel(h) {
    setPanelHoldingId(h.id);
    setPanelOpen(true);
  }

  const panelHolding = holdings.find((h) => h.id === panelHoldingId) || null;
  const categories = [...new Set(holdings.map((h) => h.category).filter(Boolean))].sort();
  const total = holdings.reduce((s, h) => s + (holdingValue(h) || 0), 0);
  const activeAccounts = accounts.filter((a) => a.is_active !== false);

  const buyingPower = buy.account_id ? Number(accounts.find((a) => a.id === buy.account_id)?.balance ?? 0) : null;
  const buyBuckets = buckets.filter((b) => b.account_id === buy.account_id);
  const buyCost =
    buy.total !== ""
      ? Number(buy.total)
      : buy.shares && buy.price
      ? Number(buy.shares) * Number(buy.price)
      : 0;

  // Group: account -> category -> holdings.
  const grouped = {};
  for (const h of holdings) {
    const cat = h.category || "Uncategorized";
    grouped[h.account_id] = grouped[h.account_id] || {};
    (grouped[h.account_id][cat] = grouped[h.account_id][cat] || []).push(h);
  }
  const sum = (list) => list.reduce((s, h) => s + (holdingValue(h) || 0), 0);

  // Purchase-history pagination.
  const histPageSize = investmentHistoryPerPage || 25;
  const histTotal = transactions.length;
  const histStart = histPage * histPageSize;
  const histPageItems = transactions.slice(histStart, histStart + histPageSize);

  return (
    <div>
      <PageHeader
        title="Investments"
        subtitle="Buy shares with an account's cash, or record what you already own. Prices come from Finnhub (stocks) and CoinGecko (crypto); each account is worth its cash plus its holdings."
        actions={
          <Button variant="secondary" onClick={refresh} disabled={busy}>
            <RefreshCw size={16} className={busy ? "animate-spin" : undefined} />
            {busy ? "Refreshing…" : "Refresh prices"}
          </Button>
        }
      />

      {error && <Banner tone="danger" className="mb-4">{error}</Banner>}

      <div className="mb-6 max-w-sm">
        <StatCard
          label="Total investments"
          value={<Amount value={total} />}
          hint="Sum of every holding at its current or manual price."
        />
      </div>

      {/* Buy investments */}
      <h2 className="text-lg font-semibold text-ink mb-2">Buy investments</h2>
      <Card className="mb-6">
        <form onSubmit={handleBuy} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Account (buying power)">
            <Select
              value={buy.account_id}
              onChange={(e) => setBuy((b) => ({ ...b, account_id: e.target.value, bucket_id: "" }))}
            >
              <option value="">Account…</option>
              {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="From bucket" hint="Optional. Spends the bucket down too, so the account stays in balance.">
            <Select value={buy.bucket_id} onChange={(e) => setBuyField("bucket_id", e.target.value)} disabled={!buy.account_id}>
              <option value="">Unallocated</option>
              {buyBuckets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Type">
            <Select value={buy.kind} onChange={(e) => setBuyField("kind", e.target.value)}>
              {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Symbol">
            <Input value={buy.symbol} onChange={(e) => setBuyField("symbol", e.target.value)} placeholder="AAPL, BTC" />
          </Field>
          <Field label="Category">
            <Input value={buy.category} onChange={(e) => setBuyField("category", e.target.value)} placeholder="Roth IRA" list="holding-categories" />
          </Field>
          <Field label="Shares">
            <Input type="number" step="any" value={buy.shares} onChange={(e) => setBuyField("shares", e.target.value)} />
          </Field>
          <Field label="Price per share">
            <Input type="number" step="any" value={buy.price} onChange={(e) => setBuyField("price", e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Total cost" hint="Optional. The exact amount charged; overrides shares x price.">
            <Input type="number" step="0.01" value={buy.total} onChange={(e) => setBuyField("total", e.target.value)} placeholder="auto" />
          </Field>
          <Field label="Date">
            <DateInput value={buy.traded_on} onChange={(v) => setBuyField("traded_on", v)} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-4">
            <Button type="submit" variant="primary">Buy</Button>
          </div>
        </form>
        {buy.account_id && (
          <p className="mt-3 text-sm text-muted">
            Buying power in {accountName(buy.account_id)}:{" "}
            <span className={buyingPower != null && buyCost > buyingPower ? "text-danger" : "text-ink"}>
              <Amount value={buyingPower} />
            </span>
            {buyCost > 0 && <> · Cost: <strong className="text-ink"><Amount value={buyCost} /></strong></>}
          </p>
        )}
      </Card>

      {/* Holdings by account */}
      {holdings.length === 0 ? (
        <p className="text-muted text-sm mb-6">No holdings yet. Buy some above.</p>
      ) : (
        Object.entries(grouped).map(([accId, cats]) => {
          const accHoldings = Object.values(cats).flat();
          return (
            <section key={accId} className="mb-6">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <h2 className="text-lg font-semibold text-ink">{accountName(accId)}</h2>
                <strong className="text-ink"><Amount value={sum(accHoldings)} /></strong>
              </div>
              <div className="overflow-x-auto">
                <Table className="table-fixed sm:min-w-[36rem]">
                  <THead>
                    <tr>
                      <TH className="w-[24%]">Holding</TH>
                      <TH className="hidden sm:table-cell w-[16%]">Type</TH>
                      <TH className="w-[18%]">Shares</TH>
                      <TH align="right" className="hidden sm:table-cell w-[21%]">Price</TH>
                      <TH align="right" className="w-[21%]">Value</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {Object.entries(cats).map(([cat, list]) => (
                      <CategoryGroup key={cat} cat={cat} list={list} onRowClick={openPanel} />
                    ))}
                  </tbody>
                </Table>
              </div>
            </section>
          );
        })
      )}

      {/* Record shares you already own (no cash movement) */}
      <h2 className="text-lg font-semibold text-ink mb-1">Record shares you already own</h2>
      <p className="text-sm text-muted mb-2">For positions you already hold. This does not move any cash — use Buy above for new purchases.</p>
      <Card className="mb-6">
        <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <Field label="Account">
            <Select value={form.account_id} onChange={(e) => setField("account_id", e.target.value)}>
              <option value="">Account…</option>
              {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="Type">
            <Select value={form.kind} onChange={(e) => setField("kind", e.target.value)}>
              {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Symbol">
            <Input value={form.symbol} onChange={(e) => setField("symbol", e.target.value)} placeholder="AAPL, BTC" />
          </Field>
          <Field label="Category">
            <Input value={form.category} onChange={(e) => setField("category", e.target.value)} placeholder="Roth IRA" list="holding-categories" />
          </Field>
          <Field label="Shares">
            <Input type="number" step="any" value={form.shares} onChange={(e) => setField("shares", e.target.value)} />
          </Field>
          <Field label="Manual price">
            <Input type="number" step="any" value={form.manual_price} onChange={(e) => setField("manual_price", e.target.value)} placeholder="auto" />
          </Field>
          <div className="sm:col-span-2 lg:col-span-6">
            <Button type="submit" variant="secondary" size="sm">Record holding</Button>
          </div>
        </form>
      </Card>

      <datalist id="holding-categories">
        {categories.map((c) => <option key={c} value={c} />)}
      </datalist>

      {/* Trade history */}
      {transactions.length > 0 && (
        <section className="mb-6">
          <h2 className="text-lg font-semibold text-ink mb-2">Trade history</h2>
          <div className="overflow-x-auto">
            <Table className="table-fixed sm:min-w-[46rem]">
              <THead>
                <tr>
                  <TH className="w-[15%]">Date</TH>
                  <TH className="w-[12%]">Type</TH>
                  <TH className="w-[15%]">Holding</TH>
                  <TH className="hidden sm:table-cell w-[20%]">Account</TH>
                  <TH className="hidden sm:table-cell w-[12%]">Shares</TH>
                  <TH align="right" className="hidden sm:table-cell w-[13%]">Price</TH>
                  <TH align="right" className="w-[13%]">Amount</TH>
                </tr>
              </THead>
              <tbody>
                {histPageItems.map((t) => (
                  <TR key={t.id}>
                    <TD className="text-ink whitespace-nowrap tabular-nums">{formatDate(t.traded_on)}</TD>
                    <TD>
                      <Badge tone={t.type === "sell" ? "success" : "info"}>{t.type === "sell" ? "Sell" : "Buy"}</Badge>
                    </TD>
                    <TD className="text-ink"><span className="block truncate">{t.symbol}</span></TD>
                    <TD className="hidden sm:table-cell text-muted"><span className="block truncate">{accountName(t.account_id)}</span></TD>
                    <TD className="hidden sm:table-cell text-muted tabular-nums">{Number(t.shares)}</TD>
                    <TD align="right" className="hidden sm:table-cell text-muted tabular-nums">{priceStr(t.price)}</TD>
                    <TD align="right"><strong className="text-ink"><Amount value={t.amount} /></strong></TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>

          {histTotal > histPageSize && (
            <div className="flex items-center justify-between gap-3 mt-3 text-sm">
              <span className="text-muted">
                {histStart + 1}–{Math.min(histStart + histPageSize, histTotal)} of {histTotal}
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => setHistPage((p) => p - 1)} disabled={histPage === 0}>Prev</Button>
                <Button size="sm" onClick={() => setHistPage((p) => p + 1)} disabled={histStart + histPageSize >= histTotal}>Next</Button>
              </div>
            </div>
          )}
        </section>
      )}

      <HoldingDetailPanel
        holding={panelHolding}
        accounts={accounts}
        buckets={buckets}
        categories={categories}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onChanged={load}
      />
    </div>
  );
}

// A category subheader row followed by its holdings, inside an account's table.
function CategoryGroup({ cat, list, onRowClick }) {
  const catTotal = list.reduce((s, h) => s + (holdingValue(h) || 0), 0);
  return (
    <>
      <tr className="bg-surface-muted">
        <TD colSpan={2} className="sm:hidden text-xs font-medium uppercase tracking-wide text-muted">{cat}</TD>
        <TD colSpan={4} className="hidden sm:table-cell text-xs font-medium uppercase tracking-wide text-muted">{cat}</TD>
        <TD align="right" className="text-xs text-muted"><Amount value={catTotal} /></TD>
      </tr>
      {list.map((h) => {
        const val = holdingValue(h);
        return (
          <TR key={h.id} onClick={() => onRowClick(h)} className="cursor-pointer">
            <TD className="text-ink">
              <span className="font-medium block truncate">{h.symbol}</span>
            </TD>
            <TD className="hidden sm:table-cell">
              <Badge tone={h.kind === "crypto" ? "orange" : "info"}>{h.kind === "crypto" ? "Crypto" : "Stock"}</Badge>
            </TD>
            <TD className="text-muted tabular-nums">{Number(h.shares)}</TD>
            <TD align="right" className="hidden sm:table-cell text-muted tabular-nums">
              {h.manual_price != null ? "manual " : ""}{priceStr(effPrice(h))}
            </TD>
            <TD align="right"><strong className="text-ink">{val == null ? <span className="text-muted">—</span> : <Amount value={val} />}</strong></TD>
          </TR>
        );
      })}
    </>
  );
}
