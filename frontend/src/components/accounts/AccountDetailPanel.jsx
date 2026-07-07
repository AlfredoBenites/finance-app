import { useEffect, useState } from "react";
import { accountsApi } from "../../api/client";
import {
  SlideOver,
  Button,
  Field,
  Input,
  Select,
  Toggle,
  Amount,
  Badge,
} from "../ui";
import { ACCOUNT_TYPES, typeLabel } from "./accountTypes";

// Slide-over to edit a single account, toggle its Buckets visibility, close /
// reopen it, or delete it. The parent keeps `account` non-null through the close
// animation (it never clears the selected id), so we don't guard for null here.
export default function AccountDetailPanel({ account, open, onClose, onChanged, onError }) {
  const [form, setForm] = useState({ name: "", account_type: "checking", balance: "", is_asset: true });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reset the form only when a different account is opened (not on every list
  // refresh), so an in-progress edit isn't clobbered by a background reload.
  useEffect(() => {
    if (!account) return;
    setForm({
      name: account.name,
      account_type: account.account_type ?? "checking",
      balance: String(account.balance ?? ""),
      is_asset: account.is_asset,
    });
    setConfirmDelete(false);
  }, [account?.id]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  async function run(fn) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      onError?.(null);
    } catch (e) {
      onError?.(e.message);
    } finally {
      setBusy(false);
    }
  }

  const closed = account?.is_active === false;

  const save = () =>
    run(async () => {
      await accountsApi.update(account.id, {
        name: form.name.trim(),
        account_type: form.account_type,
        balance: form.balance === "" ? 0 : Number(form.balance),
        is_asset: form.is_asset,
      });
      await onChanged();
    });

  const toggleShowInBuckets = () =>
    run(async () => {
      await accountsApi.update(account.id, { show_in_buckets: !account.show_in_buckets });
      await onChanged();
    });

  const setClosed = (value) =>
    run(async () => {
      await accountsApi.update(account.id, { is_active: !value });
      await onChanged();
      if (value) onClose();
    });

  const remove = () =>
    run(async () => {
      await accountsApi.remove(account.id);
      await onChanged();
      onClose();
    });

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={account?.name || "Account"}
      subtitle={account ? typeLabel(account.account_type) : undefined}
    >
      {/* Current balance summary */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <div className="text-xs text-muted">Balance</div>
          <div className="text-2xl font-semibold text-ink">
            <Amount value={account?.balance || 0} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={account?.is_asset ? "success" : "danger"}>
            {account?.is_asset ? "Asset" : "Liability"}
          </Badge>
          {closed && <Badge tone="neutral">Closed</Badge>}
        </div>
      </div>

      {/* Edit form */}
      <div className="space-y-3">
        <Field label="Name">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Type">
          <Select value={form.account_type} onChange={(e) => set("account_type", e.target.value)}>
            {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
          </Select>
        </Field>
        <Field label="Balance" hint="Manually tracked. Investment accounts with holdings are valued by their holdings instead.">
          <Input
            type="number"
            step="0.01"
            value={form.balance}
            onChange={(e) => set("balance", e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="h-4 w-4 accent-green"
            checked={form.is_asset}
            onChange={(e) => set("is_asset", e.target.checked)}
          />
          Counts as an asset
        </label>
        <p className="text-xs text-muted -mt-1">Uncheck only for a debt you track as an account, like a car loan or mortgage.</p>
        <div>
          <Button variant="primary" size="sm" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      {/* Show on Buckets page */}
      <div className="mt-6 pt-5 border-t border-border flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-ink">Show on Buckets page</div>
          <div className="text-xs text-muted mt-0.5">
            Only affects empty accounts. Turn on to list this account on Buckets so you can add its first envelope. Accounts that already have buckets always show there, so turning this off never hides them or their data.
          </div>
        </div>
        <Toggle on={!!account?.show_in_buckets} onClick={toggleShowInBuckets} />
      </div>

      {/* Danger / lifecycle actions */}
      <div className="mt-6 pt-5 border-t border-border space-y-3">
        {closed ? (
          <Button variant="secondary" size="sm" onClick={() => setClosed(false)} disabled={busy}>
            Reopen account
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setClosed(true)} disabled={busy}>
            Close account
          </Button>
        )}
        <p className="text-xs text-muted">
          Closed accounts are kept for history but don't count toward net worth.
        </p>

        <div className="pt-2">
          {confirmDelete ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-ink">Delete this account for good?</span>
              <Button variant="danger" size="sm" onClick={remove} disabled={busy}>Delete</Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} disabled={busy}>Cancel</Button>
            </div>
          ) : (
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)} disabled={busy}>
              Delete account
            </Button>
          )}
        </div>
      </div>
    </SlideOver>
  );
}
