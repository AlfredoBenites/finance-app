import { SlideOver, Badge, Button, Amount, CardArt } from "../ui";
import { formatDate } from "../../format";

// Full detail for one expense, shown in a slide-over so the row list can stay
// minimal. Holds the actions (edit / mark / delete) and, when editing, a compact
// edit form (passed in as `editForm`). Includes the card art for card payments.
function Cell({ label, children }) {
  return (
    <div className="py-2 border-b border-border">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-sm text-ink mt-0.5">{children}</div>
    </div>
  );
}

export default function TransactionDetailPanel({
  transaction,
  card,
  sourceName,
  profileName,
  own,
  editing,
  editForm,
  onEdit,
  onTogglePaid,
  onDelete,
  onEditGroup,
  onDeleteGroup,
  open,
  onClose,
}) {
  const t = transaction;
  const isRefund = t && Number(t.amount) > 0;
  const statusTone = isRefund ? "teal" : t?.is_paid_back ? "success" : own ? "info" : "orange";
  const statusText = isRefund
    ? "Refund"
    : own
    ? t?.is_paid_back ? "Paid" : "Unallocated"
    : t?.is_paid_back ? "Reimbursed" : "Not reimbursed";
  const markLabel = own
    ? t?.is_paid_back ? "Undo paid" : "Mark paid"
    : t?.is_paid_back ? "Undo reimbursed" : "Mark reimbursed";
  const typeText = isRefund ? "Refund" : "Purchase";

  return (
    <SlideOver open={open} onClose={onClose} title={t?.merchant || "Expense"}>
      {t && (
        <div className="space-y-5">
          {/* Card art stays at the top in both views; while editing it follows
              the payment source picked in the form. */}
          {card && (
            <CardArt
              name={card.name}
              network={card.network}
              lastFour={card.last_four}
              color={card.color}
              size="lg"
              className="mx-auto"
            />
          )}

          {editing ? (
            <div>{editForm}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-6">
                <Cell label="Date">{formatDate(t.transaction_date)}</Cell>
                <Cell label="Merchant">{t.merchant || "—"}</Cell>
                <Cell label="Category">{t.category || "—"}</Cell>
                <Cell label="Type">{typeText}</Cell>
                <Cell label="Profile">{profileName}</Cell>
                <Cell label="Amount"><Amount value={t.amount} /></Cell>
                <Cell label="Payment source">{sourceName}</Cell>
                <Cell label="Cashback">
                  {t.cashback_amount != null ? <Amount value={t.cashback_amount} tone="green" /> : "—"}
                </Cell>
                <Cell label="Bank status">
                  {t.credit_card_id ? (
                    <Badge tone="neutral">{t.paid_to_bank ? "Paid to bank" : "Owed to bank"}</Badge>
                  ) : (
                    "—"
                  )}
                </Cell>
                <Cell label={isRefund ? "Status" : own ? "Paid" : "Reimbursed"}>
                  <Badge tone={statusTone}>{statusText}</Badge>
                </Cell>
              </div>

              {t.notes && (
                <div>
                  <div className="text-sm text-muted mb-1">Notes</div>
                  <div className="text-sm text-ink bg-surface-muted border border-border rounded-lg px-3 py-2 whitespace-pre-wrap">
                    {t.notes}
                  </div>
                </div>
              )}

              {t.group_id && (
                <div className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm text-ink">Part of a group purchase</span>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={onEditGroup}>Edit group</Button>
                      <Button size="sm" variant="danger" onClick={onDeleteGroup}>Delete group</Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted mt-1">
                    This is one person's share. Editing or deleting the group affects every line in it.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <Button variant="primary" onClick={onEdit}>Edit</Button>
                {!isRefund && <Button onClick={onTogglePaid}>{markLabel}</Button>}
                <Button variant="danger" onClick={onDelete} className="ml-auto">Delete</Button>
              </div>
            </>
          )}
        </div>
      )}
    </SlideOver>
  );
}
