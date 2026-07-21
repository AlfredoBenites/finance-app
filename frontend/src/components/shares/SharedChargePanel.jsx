import { SlideOver, Badge, Amount } from "../ui";
import { formatDate } from "../../format";

// Read-only detail for one charge on a profile someone shared with you. There
// are no actions here: the charge belongs to the person who shared it.
function Cell({ label, children }) {
  return (
    <div className="py-2 border-b border-border">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-sm text-ink mt-0.5">{children}</div>
    </div>
  );
}

export default function SharedChargePanel({ charge, profileName, open, onClose }) {
  const t = charge;

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={t?.merchant || "Charge"}
      subtitle={profileName ? `Shared by ${profileName}` : undefined}
    >
      {t && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-x-6">
            <Cell label="Date">{formatDate(t.transaction_date)}</Cell>
            <Cell label="Amount">
              <Amount value={Math.abs(t.amount)} tone={t.is_paid_back ? "muted" : "danger"} />
            </Cell>
            <Cell label="Merchant">{t.merchant || "—"}</Cell>
            <Cell label="Category">{t.category || "—"}</Cell>
            <Cell label="Status">
              <Badge tone={t.is_paid_back ? "success" : "orange"}>
                {t.is_paid_back ? "Paid back" : "Unpaid"}
              </Badge>
            </Cell>
            <Cell label="Charged to">{t.on_card ? "A credit card" : "Cash or bank"}</Cell>
          </div>

          {t.notes && (
            <div>
              <div className="text-sm text-muted mb-1">Notes</div>
              <div className="text-sm text-ink bg-surface-muted border border-border rounded-lg px-3 py-2 whitespace-pre-wrap">
                {t.notes}
              </div>
            </div>
          )}

          {!t.on_card && (
            <p className="text-xs text-muted">
              This one was paid with cash or a bank account, so it isn't part of the card total.
            </p>
          )}
        </div>
      )}
    </SlideOver>
  );
}
