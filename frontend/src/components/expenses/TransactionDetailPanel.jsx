import { SlideOver, Badge, Button, Amount, CardArt } from "../ui";
import { formatDate } from "../../format";

// Full detail for one expense, shown in a slide-over so the row list can stay
// minimal. Holds the actions (edit / mark / delete) and, when editing, a compact
// edit form (passed in as `editForm`). Includes the card art for card payments.
function Line({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm text-ink text-right">{children}</span>
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
  open,
  onClose,
}) {
  const t = transaction;
  const statusTone = t?.is_paid_back ? "success" : own ? "info" : "orange";
  const markLabel = own
    ? t?.is_paid_back ? "Undo paid" : "Mark paid"
    : t?.is_paid_back ? "Undo reimbursed" : "Mark reimbursed";

  return (
    <SlideOver open={open} onClose={onClose} title={t?.merchant || "Expense"} subtitle={t ? formatDate(t.transaction_date) : ""}>
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
              <div>
                <Line label="Date">{formatDate(t.transaction_date)}</Line>
                <Line label="Profile">{profileName}</Line>
                <Line label="Merchant">{t.merchant || "—"}</Line>
                {t.category && <Line label="Category">{t.category}</Line>}
                <Line label="Amount"><Amount value={t.amount} /></Line>
                <Line label="Payment source">{sourceName}</Line>
                {t.cashback_amount != null && (
                  <Line label="Cashback"><Amount value={t.cashback_amount} tone="green" /></Line>
                )}
                {t.credit_card_id && (
                  <Line label="Bank status">
                    <Badge tone="neutral">{t.paid_to_bank ? "Paid to bank" : "Owed to bank"}</Badge>
                  </Line>
                )}
                <Line label={own ? "Paid" : "Reimbursed"}>
                  <Badge tone={statusTone}>{t.is_paid_back ? "Yes" : "No"}</Badge>
                </Line>
              </div>

              {t.notes && (
                <div>
                  <div className="text-sm text-muted mb-1">Notes</div>
                  <div className="text-sm text-ink bg-surface-muted border border-border rounded-lg px-3 py-2 whitespace-pre-wrap">
                    {t.notes}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <Button variant="primary" onClick={onEdit}>Edit</Button>
                <Button onClick={onTogglePaid}>{markLabel}</Button>
                <Button variant="danger" onClick={onDelete} className="ml-auto">Delete</Button>
              </div>
            </>
          )}
        </div>
      )}
    </SlideOver>
  );
}
