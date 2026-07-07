import { useEffect, useState } from "react";
import { Landmark } from "lucide-react";
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
  Input,
  Select,
  AmountInput,
  Table,
  THead,
  TH,
  TR,
  TD,
  cn,
} from "../components/ui";
import { ACCOUNT_TYPES, typeLabel } from "../components/accounts/accountTypes";
import AccountDetailPanel from "../components/accounts/AccountDetailPanel";

export default function AccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [buckets, setBuckets] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [error, setError] = useState(null);

  // Add-account form.
  const [name, setName] = useState("");
  const [type, setType] = useState(ACCOUNT_TYPES[0]);
  const [balance, setBalance] = useState("");
  const [isAsset, setIsAsset] = useState(true);

  // Transfer form.
  const [xfer, setXfer] = useState({ from: "", to: "", amount: "", fromBucket: "unallocated", toBucket: "unallocated" });

  // Detail panel — keep the id set through the close animation so the panel
  // still has its account while it slides out.
  const [panelAccountId, setPanelAccountId] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);

  // Transfer-history filters + pagination.
  const [histAccount, setHistAccount] = useState("");
  const [histMinAmount, setHistMinAmount] = useState("");
  const [histMaxAmount, setHistMaxAmount] = useState("");
  const [histPage, setHistPage] = useState(0);

  const { transferHistoryPerPage } = useSettings();

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
  }, [histAccount, histMinAmount, histMaxAmount, transferHistoryPerPage]);

  const activeAccounts = accounts.filter((a) => a.is_active !== false);
  const closedAccounts = accounts.filter((a) => a.is_active === false);

  async function handleAdd(e) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await accountsApi.create({
        name: name.trim(),
        account_type: type,
        balance: balance === "" ? 0 : Number(balance),
        is_asset: isAsset,
      });
      setName("");
      setBalance("");
      setError(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

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

  // Transfer history: filter by account (name appears in the summary) + amount range.
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || "";
  const filteredTransfers = transfers.filter((t) => {
    if (histAccount) {
      const nm = accountName(histAccount).toLowerCase();
      if (nm && !(t.summary || "").toLowerCase().includes(nm)) return false;
    }
    if (histMinAmount && Math.abs(Number(t.amount)) < Number(histMinAmount)) return false;
    if (histMaxAmount && Math.abs(Number(t.amount)) > Number(histMaxAmount)) return false;
    return true;
  });
  const histPageSize = transferHistoryPerPage || 25;
  const histTotal = filteredTransfers.length;
  const histStart = histPage * histPageSize;
  const histPageItems = filteredTransfers.slice(histStart, histStart + histPageSize);

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle="Bank, cash, and investment accounts. Balances are manual for now; net worth lives on the Dashboard."
      />

      {error && <Banner tone="danger" className="mb-4">Error: {error}</Banner>}

      {/* Add account */}
      <h2 className="text-lg font-semibold text-ink mb-2">Add an account</h2>
      <Card className="mb-6">
        <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <Field label="Name" className="lg:col-span-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chase Checking" />
          </Field>
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
            </Select>
          </Field>
          <Field label="Balance">
            <Input type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0.00" />
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="h-4 w-4 accent-green" checked={isAsset} onChange={(e) => setIsAsset(e.target.checked)} />
            Counts as an asset
          </label>
          <div className="sm:col-span-2 lg:col-span-4">
            <Button type="submit" variant="primary" size="sm">Add account</Button>
          </div>
        </form>
      </Card>

      {/* Transfer money */}
      <h2 className="text-lg font-semibold text-ink mb-2">Transfer money</h2>
      <Card className="mb-6">
        <form onSubmit={doTransfer} className="flex flex-wrap items-end gap-3">
          <Field label="Amount">
            <AmountInput className="w-32" value={xfer.amount} onChange={(v) => setXferField({ amount: v })} />
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
          <Button type="submit" size="sm">Transfer</Button>
        </form>
      </Card>

      {/* Accounts table */}
      <h2 className="text-lg font-semibold text-ink mb-2">Your accounts</h2>
      {activeAccounts.length === 0 ? (
        <p className="text-muted text-sm mb-6">No accounts yet. Add one above.</p>
      ) : (
        <div className="mb-6">
          <Table className="table-fixed min-w-[34rem]">
            <THead>
              <tr>
                <TH className="w-[40%]">Account</TH>
                <TH className="w-[22%]">Type</TH>
                <TH className="w-[16%]">Kind</TH>
                <TH align="right" className="w-[22%]">Balance</TH>
              </tr>
            </THead>
            <tbody>
              {activeAccounts.map((a) => (
                <TR key={a.id} onClick={() => openPanel(a)} className="cursor-pointer">
                  <TD className="text-ink">
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <Landmark size={16} className="text-muted shrink-0" />
                      <span className="truncate">{a.name}</span>
                      {a.show_in_buckets && <Badge tone="neutral">In Buckets</Badge>}
                    </span>
                  </TD>
                  <TD className="text-muted">{typeLabel(a.account_type)}</TD>
                  <TD>
                    <Badge tone={a.is_asset ? "success" : "danger"}>{a.is_asset ? "Asset" : "Liability"}</Badge>
                  </TD>
                  <TD align="right"><strong className="text-ink"><Amount value={a.balance} /></strong></TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {/* Closed accounts */}
      {closedAccounts.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-ink mb-2">Closed accounts</h2>
          <Table className="table-fixed min-w-[34rem]">
            <THead>
              <tr>
                <TH className="w-[40%]">Account</TH>
                <TH className="w-[22%]">Type</TH>
                <TH className="w-[16%]">Kind</TH>
                <TH align="right" className="w-[22%]">Balance</TH>
              </tr>
            </THead>
            <tbody>
              {closedAccounts.map((a) => (
                <TR key={a.id} onClick={() => openPanel(a)} className="cursor-pointer text-muted">
                  <TD>
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <Landmark size={16} className="text-muted shrink-0" />
                      <span className="truncate">{a.name}</span>
                    </span>
                  </TD>
                  <TD>{typeLabel(a.account_type)}</TD>
                  <TD><Badge tone="neutral">Closed</Badge></TD>
                  <TD align="right"><Amount value={a.balance} /></TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {/* Transfer history */}
      {transfers.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-ink mb-2">Transfer history</h2>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Select value={histAccount} onChange={(e) => setHistAccount(e.target.value)}>
              <option value="">All accounts</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
            <Input type="number" step="0.01" min="0" placeholder="Min $" className="w-28" value={histMinAmount} onChange={(e) => setHistMinAmount(e.target.value)} />
            <Input type="number" step="0.01" min="0" placeholder="Max $" className="w-28" value={histMaxAmount} onChange={(e) => setHistMaxAmount(e.target.value)} />
          </div>

          {histTotal === 0 ? (
            <p className="text-muted text-sm">No transfers match.</p>
          ) : (
            <>
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
        </div>
      )}

      <AccountDetailPanel
        account={panelAccount}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onChanged={load}
        onError={setError}
      />
    </div>
  );
}
