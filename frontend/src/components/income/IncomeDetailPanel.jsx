import { SlideOver, Badge, Button, Amount } from "../ui";
import { formatDate } from "../../format";

// Detail slide-over for one income entry: the fields, the allocation status, and
// the actions (edit / undo-or-toggle-allocation / delete). While editing it
// shows a compact form (passed in as `editForm`).
// One labelled cell in the detail grid (label above value).
function Cell({ label, children }) {
  return (
    <div className="py-2 border-b border-border">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-sm text-ink mt-0.5">{children}</div>
    </div>
  );
}

export default function IncomeDetailPanel({
  income,
  accountName,
  editing,
  editForm,
  onEdit,
  onUndoAllocation,
  onToggleTag,
  onDelete,
  open,
  onClose,
}) {
  const i = income;
  const allocated = !!i?.allocated_bucket_id;
  const pending = !!i && !i.bucket_allocated; // orange "Not allocated"
  const statusTone = allocated ? "success" : pending ? "orange" : "neutral";
  const statusText = allocated ? "Allocated" : pending ? "Not allocated" : "No allocation";

  return (
    <SlideOver open={open} onClose={onClose} title={i?.source || "Income"}>
      {i && editing && <div>{editForm}</div>}

      {i && !editing && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-x-6">
            <Cell label="Date">{formatDate(i.income_date)}</Cell>
            <Cell label="Amount"><Amount value={i.amount} tone="green" /></Cell>
            <Cell label="Source">{i.source}</Cell>
            <Cell label="Category">{i.category || "—"}</Cell>
            <Cell label="Account">{accountName}</Cell>
            <Cell label="Allocation"><Badge tone={statusTone}>{statusText}</Badge></Cell>
          </div>

          {i.notes && (
            <div>
              <div className="text-sm text-muted mb-1">Notes</div>
              <div className="text-sm text-ink bg-surface-muted border border-border rounded-lg px-3 py-2 whitespace-pre-wrap">
                {i.notes}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <Button variant="danger" onClick={onDelete}>Delete</Button>
            <div className="ml-auto flex items-center gap-2">
              {allocated ? (
                <Button onClick={onUndoAllocation} title="Reverse the bucket/balance this income added">
                  Undo allocation
                </Button>
              ) : pending ? (
                <Button onClick={onToggleTag} title="Mark as not needing allocation">Remove tag</Button>
              ) : (
                <Button onClick={onToggleTag} title="Flag as awaiting allocation again">Flag as not allocated</Button>
              )}
              <Button variant="primary" onClick={onEdit}>Edit</Button>
            </div>
          </div>
        </div>
      )}
    </SlideOver>
  );
}
