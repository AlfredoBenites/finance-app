import { useState } from "react";
import { creditCardsApi } from "../../api/client";
import { formatDate } from "../../format";
import { Button, Amount } from "../ui";

// Lets the user fix which boundary charges are on this statement (issuers bill by
// posting date). Checking/unchecking moves a charge across the cycle close by
// setting its posting_date — the transaction date shown elsewhere is untouched.
export default function StatementReconcile({ cardId, onApplied, onError }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [checks, setChecks] = useState({});
  const [busy, setBusy] = useState(false);

  async function expand() {
    setBusy(true);
    try {
      const d = await creditCardsApi.reconcile(cardId);
      setData(d);
      setChecks(Object.fromEntries(d.charges.map((c) => [c.id, c.in_statement])));
      setOpen(true);
      onError?.(null);
    } catch (e) {
      onError?.(e.message);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    setData(null);
    setChecks({});
  }

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={expand} disabled={busy}>
        {busy ? "Loading…" : "Reconcile charges…"}
      </Button>
    );
  }

  const adjusted = data.charges.reduce(
    (s, c) => s + ((checks[c.id] ? c.statement_amount : 0) - (c.in_statement ? c.statement_amount : 0)),
    data.estimate
  );
  const changed = data.charges.filter((c) => checks[c.id] !== c.in_statement);

  async function apply() {
    if (!changed.length) return close();
    setBusy(true);
    try {
      await creditCardsApi.applyReconcile(
        cardId,
        changed.map((c) => ({ transaction_id: c.id, in_statement: checks[c.id] }))
      );
      onError?.(null);
      await onApplied();
      close();
    } catch (e) {
      onError?.(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 border border-border rounded-lg p-3">
      <p className="text-sm text-muted mb-2">
        Charges near your {formatDate(data.close)} close. Uncheck the ones that are NOT on this statement (they move to next cycle); check any that should be. The adjusted total updates so you can match it to your real statement. Your transaction dates stay as they are.
      </p>
      {data.charges.length === 0 ? (
        <p className="text-sm text-muted">No charges near the cycle boundary.</p>
      ) : (
        <ul className="space-y-1 mb-3">
          {data.charges.map((c) => (
            <li key={c.id}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-green"
                  checked={!!checks[c.id]}
                  onChange={() => setChecks((s) => ({ ...s, [c.id]: !s[c.id] }))}
                />
                <span className="text-ink tabular-nums whitespace-nowrap">{formatDate(c.transaction_date)}</span>
                <span className="text-muted truncate flex-1">{c.merchant || "—"}</span>
                <span className="text-ink tabular-nums"><Amount value={-c.statement_amount} /></span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm">
          <span className="text-muted">Adjusted statement: </span>
          <strong className="text-ink"><Amount value={adjusted} /></strong>
          {adjusted !== data.estimate && (
            <span className="text-muted"> (was <Amount value={data.estimate} />)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="primary" onClick={apply} disabled={busy || !changed.length}>
            {busy ? "Saving…" : `Apply${changed.length ? ` (${changed.length})` : ""}`}
          </Button>
          <Button size="sm" variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
