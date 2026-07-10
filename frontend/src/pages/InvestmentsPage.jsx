import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { holdingsApi, accountsApi } from "../api/client";
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
  Table,
  THead,
  TH,
  TR,
  TD,
} from "../components/ui";
import HoldingDetailPanel from "../components/investments/HoldingDetailPanel";

const EMPTY = { account_id: "", symbol: "", kind: "stock", category: "", shares: "", manual_price: "" };

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
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Edit panel — keep the id set through the close animation.
  const [panelHoldingId, setPanelHoldingId] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const accountName = (id) => accounts.find((a) => a.id === id)?.name ?? "Unassigned";

  async function load() {
    try {
      const [h, a] = await Promise.all([holdingsApi.list(), accountsApi.list()]);
      setHoldings(h);
      setAccounts(a);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

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

  // Group: account -> category -> holdings.
  const grouped = {};
  for (const h of holdings) {
    const cat = h.category || "Uncategorized";
    grouped[h.account_id] = grouped[h.account_id] || {};
    (grouped[h.account_id][cat] = grouped[h.account_id][cat] || []).push(h);
  }
  const sum = (list) => list.reduce((s, h) => s + (holdingValue(h) || 0), 0);

  return (
    <div>
      <PageHeader
        title="Investments"
        subtitle="Enter your shares; prices come from Finnhub (stocks) and CoinGecko (crypto). An account's value becomes the sum of its holdings and flows into net worth."
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

      {/* Add a holding */}
      <h2 className="text-lg font-semibold text-ink mb-2">Add a holding</h2>
      <Card className="mb-6">
        <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <Field label="Account">
            <Select value={form.account_id} onChange={(e) => setField("account_id", e.target.value)}>
              <option value="">Account…</option>
              {accounts.filter((a) => a.is_active !== false).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
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
            <datalist id="holding-categories">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </Field>
          <Field label="Shares">
            <Input type="number" step="any" value={form.shares} onChange={(e) => setField("shares", e.target.value)} />
          </Field>
          <Field label="Manual price">
            <Input type="number" step="any" value={form.manual_price} onChange={(e) => setField("manual_price", e.target.value)} placeholder="auto" />
          </Field>
          <div className="sm:col-span-2 lg:col-span-6">
            <Button type="submit" variant="primary" size="sm">Add holding</Button>
          </div>
        </form>
      </Card>

      {/* Holdings by account */}
      {holdings.length === 0 ? (
        <p className="text-muted text-sm">No holdings yet. Add one above.</p>
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
                <Table className="table-fixed min-w-[36rem]">
                  <THead>
                    <tr>
                      <TH className="w-[30%]">Holding</TH>
                      <TH className="w-[22%]">Shares</TH>
                      <TH align="right" className="w-[24%]">Price</TH>
                      <TH align="right" className="w-[24%]">Value</TH>
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

      <HoldingDetailPanel
        holding={panelHolding}
        accounts={accounts}
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
        <TD className="text-xs font-medium uppercase tracking-wide text-muted">{cat}</TD>
        <TD />
        <TD />
        <TD align="right" className="text-xs text-muted"><Amount value={catTotal} /></TD>
      </tr>
      {list.map((h) => {
        const val = holdingValue(h);
        return (
          <TR key={h.id} onClick={() => onRowClick(h)} className="cursor-pointer">
            <TD className="text-ink">
              <span className="inline-flex items-center gap-2 min-w-0">
                <span className="font-medium truncate">{h.symbol}</span>
                <Badge tone={h.kind === "crypto" ? "orange" : "info"}>{h.kind === "crypto" ? "Crypto" : "Stock"}</Badge>
              </span>
            </TD>
            <TD className="text-muted tabular-nums">{Number(h.shares)}</TD>
            <TD align="right" className="text-muted tabular-nums">
              {h.manual_price != null ? "manual " : ""}{priceStr(effPrice(h))}
            </TD>
            <TD align="right"><strong className="text-ink">{val == null ? <span className="text-muted">—</span> : <Amount value={val} />}</strong></TD>
          </TR>
        );
      })}
    </>
  );
}
