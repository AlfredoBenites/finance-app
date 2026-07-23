import { useEffect, useState } from "react";
import { incomeApi, accountsApi, bucketsApi } from "../api/client";
import { INCOME_TYPES } from "../constants";
import YearSelect, { CURRENT_YEAR } from "../components/YearSelect";
import { formatDate } from "../format";
import {
  PageHeader,
  Card,
  Button,
  Badge,
  Banner,
  Amount,
  Select,
  Input,
  Table,
  THead,
  TH,
  TR,
  TD,
} from "../components/ui";
import { useIncomeForm, IncomeFields, EMPTY_INCOME } from "../components/income/IncomeForm";
import IncomeDetailPanel from "../components/income/IncomeDetailPanel";
import { useSettings } from "../settings/SettingsContext";

const uniqSorted = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b));

export default function IncomePage() {
  const [income, setIncome] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [pool, setPool] = useState([]); // all income (any year) for dropdown options
  const [error, setError] = useState(null);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [filters, setFilters] = useState({ category: "", account: "", allocation: "", search: "" });
  const { incomePerPage } = useSettings();
  const pageSize = incomePerPage || 15;
  const [page, setPage] = useState(0);

  const addForm = useIncomeForm();
  const editForm = useIncomeForm();
  const [editingId, setEditingId] = useState(null);
  const [detailIncome, setDetailIncome] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const openDetail = (i) => {
    setDetailIncome(i);
    setDetailOpen(true);
  };

  const accountName = (id) => accounts.find((a) => a.id === id)?.name ?? "—";

  async function load() {
    try {
      const [inc, accts] = await Promise.all([
        incomeApi.list(year === "all" ? undefined : year),
        accountsApi.list(),
      ]);
      setIncome(inc);
      setAccounts(accts);
    } catch (e) {
      setError(e.message);
    }
  }
  async function loadPool() {
    try {
      setPool(await incomeApi.list());
    } catch (e) {
      // dropdown suggestions are best-effort
    }
  }
  useEffect(() => { load(); }, [year]);
  useEffect(() => { loadPool(); }, []);

  const categoryOptions = uniqSorted([...INCOME_TYPES, ...pool.map((e) => e.category)]);
  const sourceOptions = uniqSorted([...pool.map((e) => e.source)]);

  async function submit(e, form, id) {
    e.preventDefault();
    if (!form.source.trim() || !form.amount || !form.account_id) {
      setError("Source, amount, and account are required.");
      return;
    }
    const payload = {
      income_date: form.income_date,
      source: form.source.trim(),
      category: form.category,
      amount: Math.abs(Number(form.amount)),
      account_id: form.account_id || null,
      notes: form.notes.trim() || null,
    };
    try {
      if (id) await incomeApi.update(id, payload);
      else await incomeApi.create(payload);
      if (id) setEditingId(null);
      else addForm.reset({ ...EMPTY_INCOME, income_date: form.income_date });
      setError(null);
      load();
      loadPool();
    } catch (e2) {
      setError(e2.message);
    }
  }

  function startEdit(i) {
    setEditingId(i.id);
    setError(null);
    editForm.reset({
      income_date: i.income_date,
      source: i.source ?? "",
      category: i.category ?? INCOME_TYPES[0],
      amount: String(Math.abs(Number(i.amount))),
      account_id: i.account_id ?? "",
      notes: i.notes ?? "",
    });
  }

  async function handleDelete(id) {
    try {
      await incomeApi.remove(id);
      if (editingId === id) setEditingId(null);
      if (detailIncome?.id === id) setDetailOpen(false);
      load();
      loadPool();
    } catch (e) {
      setError(e.message);
    }
  }

  async function toggleTag(i) {
    // Not-allocated ⇄ dismissed: flip the "handled" flag (removes/restores the tag).
    try {
      await incomeApi.update(i.id, { bucket_allocated: !i.bucket_allocated });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function undoAllocation(id) {
    try {
      await bucketsApi.undoIncomeAllocation({ income_id: id });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  // Client-side filters over the year's entries.
  const visible = income.filter((i) => {
    if (filters.category && (i.category || "") !== filters.category) return false;
    if (filters.account && i.account_id !== filters.account) return false;
    if (filters.allocation === "allocated" && !i.allocated_bucket_id) return false;
    if (filters.allocation === "notallocated" && i.bucket_allocated) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!`${i.source} ${i.notes || ""}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  useEffect(() => {
    setPage(0);
  }, [filters, year, pageSize]);
  const total = visible.length;
  const start = page * pageSize;
  const pageItems = visible.slice(start, start + pageSize);

  const showYear = year === "all";
  const shortDate = (iso) => (showYear ? formatDate(iso) : formatDate(iso).replace(/,\s*\d{4}$/, ""));

  const shownIncome = detailIncome ? income.find((x) => x.id === detailIncome.id) || detailIncome : null;
  const editingShown = !!shownIncome && editingId === shownIncome.id;
  const editFieldsNode = editingShown ? (
    <IncomeFields
      instance={editForm}
      accounts={accounts}
      categoryOptions={categoryOptions}
      sourceOptions={sourceOptions}
      onSubmit={(e) => submit(e, editForm.form, shownIncome.id)}
      onCancel={() => setEditingId(null)}
      submitLabel="Save changes"
      panel
    />
  ) : null;

  function statusFor(i) {
    if (i.allocated_bucket_id) return ["success", "Allocated"];
    if (!i.bucket_allocated) return ["orange", "Not allocated"];
    return null; // dismissed / handled — no tag
  }

  return (
    <div>
      <PageHeader title="Income" subtitle="Money coming in, by source and account." />

      {/* Add form (add only) */}
      <Card className="mb-6">
        <IncomeFields
          instance={addForm}
          accounts={accounts}
          categoryOptions={categoryOptions}
          sourceOptions={sourceOptions}
          onSubmit={(e) => submit(e, addForm.form, null)}
          submitLabel="Add income"
        />
      </Card>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <YearSelect value={year} onChange={setYear} />
        <Select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}>
          <option value="">All categories</option>
          {categoryOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
        <Select value={filters.account} onChange={(e) => setFilters((f) => ({ ...f, account: e.target.value }))}>
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
        <Select value={filters.allocation} onChange={(e) => setFilters((f) => ({ ...f, allocation: e.target.value }))}>
          <option value="">All</option>
          <option value="allocated">Allocated</option>
          <option value="notallocated">Not allocated</option>
        </Select>
        <Input
          className="flex-1 min-w-[12rem]"
          placeholder="Search source or notes"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
        />
      </div>

      {error && <Banner tone="danger" className="mb-4">Error: {error}</Banner>}

      {total === 0 ? (
        <p className="text-muted text-sm">No income matches.</p>
      ) : (
        <>
        <Table className="table-fixed sm:min-w-[46rem]">
          <THead>
            <tr>
              <TH className="w-[20%]">Source</TH>
              <TH className="hidden sm:table-cell w-[15%]">Status</TH>
              <TH className="hidden sm:table-cell w-[12%]">Date</TH>
              <TH className="hidden sm:table-cell w-[16%]">Account</TH>
              <TH align="right" className="w-[13%]">Amount</TH>
              <TH className="hidden sm:table-cell w-[24%]">Notes</TH>
            </tr>
          </THead>
          <tbody>
            {pageItems.map((i) => {
              const status = statusFor(i);
              return (
                <TR key={i.id} onClick={() => openDetail(i)} className="cursor-pointer">
                  <TD>
                    <span className="block truncate text-ink font-medium">{i.source}</span>
                    {status && (
                      <span className="sm:hidden inline-flex mt-0.5">
                        <Badge tone={status[0]}>{status[1]}</Badge>
                      </span>
                    )}
                  </TD>
                  <TD className="hidden sm:table-cell">{status && <Badge tone={status[0]}>{status[1]}</Badge>}</TD>
                  <TD className="hidden sm:table-cell text-ink whitespace-nowrap">{shortDate(i.income_date)}</TD>
                  <TD className="hidden sm:table-cell text-ink truncate">{accountName(i.account_id)}</TD>
                  <TD align="right">
                    <strong><Amount value={i.amount} tone="green" /></strong>
                  </TD>
                  <TD className="hidden sm:table-cell text-muted">
                    <span className="block truncate" title={i.notes || ""}>{i.notes || ""}</span>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>

        {total > pageSize && (
          <div className="flex items-center justify-between gap-3 mt-3 text-sm">
            <span className="text-muted">
              {start + 1}–{Math.min(start + pageSize, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>Prev</Button>
              <Button size="sm" onClick={() => setPage((p) => p + 1)} disabled={start + pageSize >= total}>Next</Button>
            </div>
          </div>
        )}
        </>
      )}

      <IncomeDetailPanel
        income={shownIncome}
        accountName={shownIncome ? accountName(shownIncome.account_id) : ""}
        editing={editingShown}
        editForm={editFieldsNode}
        onEdit={() => startEdit(shownIncome)}
        onUndoAllocation={() => undoAllocation(shownIncome.id)}
        onToggleTag={() => toggleTag(shownIncome)}
        onDelete={() => handleDelete(shownIncome.id)}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </div>
  );
}
