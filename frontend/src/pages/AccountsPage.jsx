import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { accountsApi, bucketsApi } from "../api/client";
import { formatDate } from "../format";
import { useSettings } from "../settings/SettingsContext";
import {
  PageHeader,
  Card,
  Button,
  Badge,
  Banner,
  Amount,
  Field,
  Select,
  AmountInput,
  DateInput,
  Table,
  THead,
  TH,
  TR,
  TD,
} from "../components/ui";
import { BucketIcon } from "../components/buckets/bucketIcons";
import { typeLabel } from "../components/accounts/accountTypes";
import AccountDetailPanel from "../components/accounts/AccountDetailPanel";
import AccountsManagerPanel from "../components/accounts/AccountsManagerPanel";

// Order an array of {id} by a saved list of ids; anything not listed goes last.
function applyOrder(items, order) {
  const set = new Set(order || []);
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  const inOrder = (order || []).map((id) => byId[id]).filter(Boolean);
  const rest = items.filter((i) => !set.has(i.id));
  return [...inOrder, ...rest];
}

const EMPTY_FILTERS = { account: "", from: "", to: "", min: "", max: "" };

export default function AccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [buckets, setBuckets] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [error, setError] = useState(null);

  // Transfer form.
  const [xfer, setXfer] = useState({ from: "", to: "", amount: "", fromBucket: "unallocated", toBucket: "unallocated" });

  // Panels — keep the selected id set through the close animation so the panel
  // still has its data while it slides out.
  const [panelAccountId, setPanelAccountId] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);

  // Transfer-history filters + pagination.
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [histPage, setHistPage] = useState(0);

  const { transferHistoryPerPage, accountOrder, accountIconColors } = useSettings();

  async function load() {
    try {
      const [a, b, tr] = await Promise.all([accountsApi.list(), bucketsApi.list(), accountsApi.transfers()]);
      setAccounts(a);
      setBuckets(b);
      setTransfers(tr);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setHistPage(0);
  }, [filters, transferHistoryPerPage]);

  const activeAccounts = accounts.filter((a) => a.is_active !== false);
  const orderedActive = applyOrder(activeAccounts, accountOrder);

  async function doTransfer(e) {
    e.preventDefault();
    if (!xfer.from || !xfer.to || !xfer.amount) {
      setError("Pick both accounts and an amount to transfer.");
      return;
    }
    try {
      await accountsApi.transfer({
        from_account_id: xfer.from,
        to_account_id: xfer.to,
        amount: Number(xfer.amount),
        from_bucket_id: xfer.fromBucket || "unallocated",
        to_bucket_id: xfer.toBucket || "unallocated",
      });
      setXfer({ from: "", to: "", amount: "", fromBucket: "unallocated", toBucket: "unallocated" });
      setError(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  function openPanel(a) {
    setPanelAccountId(a.id);
    setPanelOpen(true);
  }

  const panelAccount = accounts.find((a) => a.id === panelAccountId) || null;
  const setXferField = (patch) => setXfer((s) => ({ ...s, ...patch }));
  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  // Transfer history: filter by account (name appears in the summary), date
  // range, and amount range.
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || "";
  const filteredTransfers = transfers.filter((t) => {
    const day = (t.created_at || "").slice(0, 10);
    if (filters.account) {
      const nm = accountName(filters.account).toLowerCase();
      if (nm && !(t.summary || "").toLowerCase().includes(nm)) return false;
    }
    if (filters.from && day < filters.from) return false;
    if (filters.to && day > filters.to) return false;
    if (filters.min && Math.abs(Number(t.amount)) < Number(filters.min)) return false;
    if (filters.max && Math.abs(Number(t.amount)) > Number(filters.max)) return false;
    return true;
  });
  const histPageSize = transferHistoryPerPage || 25;
  const histTotal = filteredTransfers.length;
  const histStart = histPage * histPageSize;
  const histPageItems = filteredTransfers.slice(histStart, histStart + histPageSize);

  const AccountsTable = ({ rows }) => (
    <div className="overflow-x-auto">
      <Table className="table-fixed min-w-[38rem]">
        <THead>
          <tr>
            <TH className="w-[34%]">Account</TH>
            <TH className="w-[18%]">Type</TH>
            <TH className="w-[14%]">Kind</TH>
            <TH className="w-[16%]">Buckets</TH>
            <TH align="right" className="w-[18%]">Balance</TH>
          </tr>
        </THead>
        <tbody>
          {rows.map((a) => (
            <TR key={a.id} onClick={() => openPanel(a)} className="cursor-pointer">
              <TD className="text-ink">
                <span className="inline-flex items-center gap-2 min-w-0">
                  <BucketIcon icon="landmark" color={accountIconColors[a.id]} />
                  <span className="truncate">{a.name}</span>
                </span>
              </TD>
              <TD className="text-muted">{typeLabel(a.account_type)}</TD>
              <TD>
                <Badge tone={a.is_asset ? "success" : "danger"}>{a.is_asset ? "Asset" : "Liability"}</Badge>
              </TD>
              <TD>
                {a.show_in_buckets ? <Badge tone="neutral">In Buckets</Badge> : null}
              </TD>
              <TD align="right">
                <strong className="text-ink"><Amount value={a.balance} /></strong>
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle="Bank, cash, and investment accounts. Balances are manual for now; net worth lives on the Dashboard."
      />

      {error && <Banner tone="danger" className="mb-4">Error: {error}</Banner>}

      {/* Transfer money */}
      <h2 className="text-lg font-semibold text-ink mb-2">Transfer Money</h2>
      <Card className="mb-6">
        <form onSubmit={doTransfer} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <Field label="Amount">
            <AmountInput value={xfer.amount} onChange={(v) => setXferField({ amount: v })} />
          </Field>
          <Field label="From account">
            <Select value={xfer.from} onChange={(e) => setXferField({ from: e.target.value, fromBucket: "unallocated" })}>
              <option value="">Account…</option>
              {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="From bucket">
            <Select value={xfer.fromBucket} onChange={(e) => setXferField({ fromBucket: e.target.value })}>
              <option value="unallocated">Unallocated</option>
              {buckets.filter((b) => b.account_id === xfer.from).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="To account">
            <Select value={xfer.to} onChange={(e) => setXferField({ to: e.target.value, toBucket: "unallocated" })}>
              <option value="">Account…</option>
              {activeAccounts.filter((a) => a.id !== xfer.from).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="To bucket">
            <Select value={xfer.toBucket} onChange={(e) => setXferField({ toBucket: e.target.value })}>
              <option value="unallocated">Unallocated</option>
              {buckets.filter((b) => b.account_id === xfer.to).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button type="submit" variant="primary" className="w-full">Transfer</Button>
          </div>
        </form>
      </Card>

      {/* Your accounts — click the heading to open the manage panel. */}
      <div className="mb-1">
        <button
          onClick={() => setManagerOpen(true)}
          title="Add, reorder, and color accounts"
          className="text-lg font-semibold text-ink hover:text-green transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
        >
          Your Accounts
        </button>
      </div>
      <p className="text-sm text-muted mb-3">Click "Your Accounts" above to add, reorder, or recolor your accounts.</p>
      {orderedActive.length === 0 ? (
        <p className="text-muted text-sm mb-6">No accounts yet. Click "Your Accounts" to add one.</p>
      ) : (
        <div className="mb-6">
          <AccountsTable rows={orderedActive} />
        </div>
      )}

      {/* Transfer history */}
      {transfers.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-ink mb-2">Transfer History</h2>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Select className="flex-1 min-w-[10rem]" value={filters.account} onChange={(e) => setFilter("account", e.target.value)}>
              <option value="">All accounts</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
            <label className="flex items-center gap-1 text-sm text-muted">
              From
              <DateInput className="w-40" value={filters.from} onChange={(v) => setFilter("from", v)} />
            </label>
            <label className="flex items-center gap-1 text-sm text-muted">
              To
              <DateInput className="w-40" value={filters.to} onChange={(v) => setFilter("to", v)} />
            </label>
            <AmountInput className="w-28" placeholder="Min" value={filters.min} onChange={(v) => setFilter("min", v)} />
            <AmountInput className="w-28" placeholder="Max" value={filters.max} onChange={(v) => setFilter("max", v)} />
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

          {histTotal === 0 ? (
            <p className="text-muted text-sm">No transfers match.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table className="table-fixed min-w-[32rem]">
                  <THead>
                    <tr>
                      <TH className="w-[22%]">Date</TH>
                      <TH className="w-[58%]">Summary</TH>
                      <TH align="right" className="w-[20%]">Amount</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {histPageItems.map((t) => (
                      <TR key={t.id}>
                        <TD className="text-ink whitespace-nowrap tabular-nums">{formatDate(t.created_at)}</TD>
                        <TD className="text-muted"><span className="block truncate" title={t.summary}>{t.summary}</span></TD>
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
            </>
          )}
        </>
      )}

      <AccountsManagerPanel
        accounts={accounts}
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        onChanged={load}
        onError={setError}
      />

      <AccountDetailPanel
        account={panelAccount}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onChanged={load}
      />
    </div>
  );
}
