import { useEffect, useState } from "react";
import {
  profilesApi,
  creditCardsApi,
  accountsApi,
  transactionsApi,
  transactionGroupsApi,
  cashbackRulesApi,
  categoriesApi,
  merchantCategoriesApi,
} from "../api/client";
import { CATEGORIES as FALLBACK_CATEGORIES } from "../constants";
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
import { useExpenseForm, ExpenseFields, today } from "../components/expenses/ExpenseForm";
import GroupPurchaseForm from "../components/expenses/GroupPurchaseForm";
import TransactionDetailPanel from "../components/expenses/TransactionDetailPanel";
import { Modal } from "../components/ui";
import { useSettings } from "../settings/SettingsContext";

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [cards, setCards] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [rules, setRules] = useState([]);
  const [categoryList, setCategoryList] = useState([]);
  const [merchantDefaults, setMerchantDefaults] = useState([]); // [{merchant, category}]
  const [error, setError] = useState(null);

  const [editingId, setEditingId] = useState(null);
  // The detail panel keeps its transaction while closing so the title doesn't
  // blank out mid-animation; `detailOpen` drives the slide.
  const [detailTxn, setDetailTxn] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const openDetail = (t) => {
    setDetailTxn(t);
    setDetailOpen(true);
  };
  const [groupEdit, setGroupEdit] = useState(null); // { id, data } for the group edit modal

  async function openGroupEdit(groupId) {
    try {
      const g = await transactionGroupsApi.get(groupId);
      setGroupEdit({ id: groupId, data: g.data });
    } catch (e) {
      setError(e.message);
    }
  }
  async function deleteGroup(groupId) {
    try {
      await transactionGroupsApi.remove(groupId);
      setDetailOpen(false);
      loadTransactions();
    } catch (e) {
      setError(e.message);
    }
  }

  // Initial filters come from Settings (Expenses → Default filters).
  const { expensesPerPage, expensesFilters } = useSettings();
  const pageSize = expensesPerPage || 15;
  const initYear =
    expensesFilters.year === "all" ? "" : expensesFilters.year === "current" ? CURRENT_YEAR : expensesFilters.year;
  const [filters, setFilters] = useState({
    profile_id: expensesFilters.profile_id || "",
    is_paid_back: expensesFilters.is_paid_back || "",
    search: "",
    year: initYear || CURRENT_YEAR,
  });
  // Applied client-side on the loaded list. "card:<id>" or "account:<id>".
  const [sourceFilter, setSourceFilter] = useState(expensesFilters.source || "");
  const [page, setPage] = useState(0);

  const profileName = (id) => profiles.find((p) => p.id === id)?.name ?? "—";
  const primaryId = profiles.find((p) => p.is_primary)?.id;
  const isOwn = (t) => t.profile_id === primaryId;
  const cardName = (id) => cards.find((c) => c.id === id)?.name ?? "—";
  const accountName = (id) => accounts.find((a) => a.id === id)?.name ?? "—";
  const sourceName = (t) => (t.credit_card_id ? cardName(t.credit_card_id) : accountName(t.account_id));

  function mergeCategories(apiCats) {
    const names = new Set([...FALLBACK_CATEGORIES, ...apiCats.map((c) => c.name)]);
    return [...names].sort();
  }

  async function onAddCategory() {
    const name = window.prompt("New category name:");
    if (!name || !name.trim()) return null;
    try {
      await categoriesApi.create(name.trim());
      setCategoryList(mergeCategories(await categoriesApi.list()));
      return name.trim();
    } catch (e) {
      setError(e.message);
      return null;
    }
  }

  const deps = { cards, rules, merchantDefaults, onAddCategory };
  const addForm = useExpenseForm(deps);
  const editForm = useExpenseForm(deps);
  const merchantNames = merchantDefaults.map((m) => m.merchant);

  async function loadLookups() {
    try {
      const [p, c, a, r, cats, md] = await Promise.all([
        profilesApi.list(),
        creditCardsApi.list(),
        accountsApi.list(),
        cashbackRulesApi.listAll(),
        categoriesApi.list(),
        merchantCategoriesApi.list(),
      ]);
      setProfiles(p);
      setCards(c);
      setAccounts(a);
      setRules(r);
      setCategoryList(mergeCategories(cats));
      setMerchantDefaults(md);
    } catch (e) {
      setError(e.message);
    }
  }

  async function loadTransactions() {
    try {
      setTransactions(await transactionsApi.list(filters));
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    loadLookups();
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [filters]);

  function startEdit(t) {
    setEditingId(t.id);
    setError(null);
    editForm.reset({
      transaction_date: t.transaction_date,
      merchant: t.merchant ?? "",
      category: t.category ?? "",
      type: Number(t.amount) < 0 ? "purchase" : "refund",
      amount: String(Math.abs(Number(t.amount))),
      profile_id: t.profile_id,
      paymentSource: t.credit_card_id ? `card:${t.credit_card_id}` : `account:${t.account_id}`,
      cashbackPct: t.cashback_rate != null ? String(Number(t.cashback_rate) * 100) : "",
      refund_for_id: t.refund_for_id ?? null,
      notes: t.notes ?? "",
    });
  }

  // Shared create/update used by both the add form and the inline edit form.
  async function submit(e, form, id) {
    e.preventDefault();
    if (!form.amount || !form.profile_id || !form.paymentSource) {
      setError("Amount, profile, and payment source are required.");
      return;
    }
    const isCard = form.paymentSource.startsWith("card:");
    const sourceId = form.paymentSource.split(":")[1];
    const magnitude = Math.abs(Number(form.amount));
    const amount = form.type === "purchase" ? -magnitude : magnitude;
    const rate = isCard && form.cashbackPct !== "" ? Number(form.cashbackPct) / 100 : null;
    const merchant = form.merchant.trim() || null;
    const payload = {
      transaction_date: form.transaction_date,
      merchant,
      category: form.category || null,
      amount,
      profile_id: form.profile_id,
      credit_card_id: isCard ? sourceId : null,
      account_id: isCard ? null : sourceId,
      cashback_rate: rate,
      // Only a card refund can be linked to a purchase it offsets.
      refund_for_id: form.type === "refund" && isCard ? form.refund_for_id || null : null,
      notes: form.notes.trim() || null,
    };
    try {
      if (id) await transactionsApi.update(id, payload);
      else await transactionsApi.create(payload);
      // Remember this merchant's category for next time.
      if (merchant && form.category) {
        await merchantCategoriesApi.upsert(merchant, form.category);
        setMerchantDefaults(await merchantCategoriesApi.list());
      }
      if (id) setEditingId(null);
      else addForm.reset();
      setError(null);
      loadTransactions();
    } catch (e2) {
      setError(e2.message);
    }
  }

  async function togglePaid(t) {
    const markingReimbursed = !t.is_paid_back;
    try {
      await transactionsApi.update(t.id, {
        is_paid_back: markingReimbursed,
        paid_back_date: markingReimbursed ? today() : null,
        // marking reimbursed re-opens the "move money to the card" suggestion
        ...(markingReimbursed ? { reimbursement_allocated: false } : {}),
      });
      loadTransactions();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(id) {
    try {
      await transactionsApi.remove(id);
      if (editingId === id) setEditingId(null);
      if (detailTxn?.id === id) setDetailOpen(false);
      loadTransactions();
    } catch (e) {
      setError(e.message);
    }
  }

  const visibleTransactions = sourceFilter
    ? transactions.filter((t) =>
        sourceFilter.startsWith("card:")
          ? t.credit_card_id === sourceFilter.slice(5)
          : t.account_id === sourceFilter.slice(8)
      )
    : transactions;

  // Paginate the filtered list (rows-per-page from Settings).
  useEffect(() => {
    setPage(0);
  }, [filters, sourceFilter, pageSize]);
  const total = visibleTransactions.length;
  const start = page * pageSize;
  const pageItems = visibleTransactions.slice(start, start + pageSize);

  // Show the year in row dates only when viewing all time; otherwise "Jul 8".
  const showYear = filters.year === "";
  const shortDate = (iso) => (showYear ? formatDate(iso) : formatDate(iso).replace(/,\s*\d{4}$/, ""));

  // The transaction shown in the panel, kept fresh from the list (so an edit
  // reflects immediately) but retained while the panel animates closed.
  const shownTxn = detailTxn ? transactions.find((x) => x.id === detailTxn.id) || detailTxn : null;
  const editingShown = !!shownTxn && editingId === shownTxn.id;
  // Card art for the panel: while editing, follow the payment source picked in
  // the form (so it changes live); otherwise the transaction's own card.
  const editCardId = editForm.form.paymentSource.startsWith("card:")
    ? editForm.form.paymentSource.slice(5)
    : null;
  const panelCard = editingShown
    ? editCardId
      ? cards.find((c) => c.id === editCardId)
      : null
    : shownTxn?.credit_card_id
      ? cards.find((c) => c.id === shownTxn.credit_card_id)
      : null;
  const editFieldsNode = editingShown ? (
    <ExpenseFields
      instance={editForm}
      profiles={profiles}
      cards={cards}
      accounts={accounts}
      categoryList={categoryList}
      merchantNames={merchantNames}
      refundCandidates={transactions.filter((t) => t.id !== shownTxn.id)}
      onSubmit={(e) => submit(e, editForm.form, shownTxn.id)}
      onCancel={() => setEditingId(null)}
      submitLabel="Save changes"
      panel
    />
  ) : null;

  return (
    <div>
      <PageHeader title="Expenses" subtitle="Add, edit, and track your purchases and refunds." />

      {/* Add form (swaps to the group calculator when Type = Group purchase) */}
      <Card className="mb-6">
        {addForm.form.type === "group" ? (
          <GroupPurchaseForm
            profiles={profiles}
            cards={cards}
            categoryList={categoryList}
            primaryId={primaryId}
            onExitGroup={(t) => addForm.setField("type", t)}
            onDone={() => { addForm.reset(); loadTransactions(); }}
            setError={setError}
          />
        ) : (
          <ExpenseFields
            instance={addForm}
            profiles={profiles}
            cards={cards}
            accounts={accounts}
            categoryList={categoryList}
            merchantNames={merchantNames}
            refundCandidates={transactions}
            onSubmit={(e) => submit(e, addForm.form, null)}
            submitLabel="Add expense"
          />
        )}
      </Card>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <YearSelect
          value={filters.year === "" ? "all" : filters.year}
          onChange={(v) => setFilters((f) => ({ ...f, year: v === "all" ? "" : v }))}
        />
        <Select value={filters.profile_id} onChange={(e) => setFilters((f) => ({ ...f, profile_id: e.target.value }))}>
          <option value="">All profiles</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
        <Select value={filters.is_paid_back} onChange={(e) => setFilters((f) => ({ ...f, is_paid_back: e.target.value }))}>
          <option value="">Paid + unpaid</option>
          <option value="false">Unpaid only</option>
          <option value="true">Paid only</option>
        </Select>
        <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
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
        <Input
          className="flex-1 min-w-[12rem]"
          placeholder="Search merchant or notes"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
        />
      </div>

      {error && <Banner tone="danger" className="mb-4">Error: {error}</Banner>}
      {total === 0 ? (
        <p className="text-muted text-sm">No transactions match.</p>
      ) : (
        <>
          <Table className="table-fixed min-w-[48rem]">
            <THead>
              <tr>
                <TH className="w-[19%]">Merchant</TH>
                <TH className="w-[20%]">Status</TH>
                <TH className="w-[12%]">Date</TH>
                <TH className="w-[15%]">Card</TH>
                <TH align="right" className="w-[12%]">Amount</TH>
                <TH className="w-[22%]">Notes</TH>
              </tr>
            </THead>
            <tbody>
              {pageItems.map((t) => {
                const own = isOwn(t);
                // A refund (positive amount) just offsets debt; it isn't
                // reimbursable, so it gets a plain teal "Refund" tag.
                const isRefund = Number(t.amount) > 0;
                const statusText = isRefund
                  ? "Refund"
                  : own
                  ? (t.is_paid_back ? "Paid" : "Unallocated")
                  : (t.is_paid_back ? "Reimbursed" : "Not reimbursed");
                // Own not-yet-allocated = calm blue/slate ("Unallocated");
                // others' not-reimbursed = orange (waiting on someone else).
                const statusTone = isRefund ? "teal" : t.is_paid_back ? "success" : own ? "info" : "orange";
                return (
                  <TR key={t.id} onClick={() => openDetail(t)} className="cursor-pointer">
                    <TD>
                      <span className="block truncate text-ink font-medium">{t.merchant || "—"}</span>
                    </TD>
                    <TD>
                      <span className="inline-flex items-center gap-1 flex-wrap">
                        <Badge tone={statusTone}>{statusText}</Badge>
                        {t.group_id && <Badge tone="neutral">Group</Badge>}
                      </span>
                    </TD>
                    <TD className="text-ink whitespace-nowrap">{shortDate(t.transaction_date)}</TD>
                    <TD className="text-ink truncate">{sourceName(t)}</TD>
                    <TD align="right">
                      <strong className="text-ink"><Amount value={t.amount} /></strong>
                    </TD>
                    <TD className="text-muted">
                      <span className="block truncate" title={t.notes || ""}>{t.notes || ""}</span>
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

      <TransactionDetailPanel
        transaction={shownTxn}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        card={panelCard}
        sourceName={shownTxn ? sourceName(shownTxn) : ""}
        profileName={shownTxn ? profileName(shownTxn.profile_id) : ""}
        own={shownTxn ? isOwn(shownTxn) : false}
        editing={editingShown}
        editForm={editFieldsNode}
        onEdit={() => startEdit(shownTxn)}
        onTogglePaid={() => togglePaid(shownTxn)}
        onDelete={() => handleDelete(shownTxn.id)}
        onEditGroup={() => shownTxn?.group_id && openGroupEdit(shownTxn.group_id)}
        onDeleteGroup={() => shownTxn?.group_id && deleteGroup(shownTxn.group_id)}
      />

      <Modal open={!!groupEdit} onClose={() => setGroupEdit(null)} title="Edit group purchase" width="max-w-3xl">
        {groupEdit && (
          <GroupPurchaseForm
            profiles={profiles}
            cards={cards}
            categoryList={categoryList}
            primaryId={primaryId}
            groupId={groupEdit.id}
            initialData={groupEdit.data}
            onDone={() => { setGroupEdit(null); setDetailOpen(false); loadTransactions(); }}
            setError={setError}
          />
        )}
      </Modal>
    </div>
  );
}
