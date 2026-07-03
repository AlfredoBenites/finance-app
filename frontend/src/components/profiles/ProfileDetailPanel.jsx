import { SlideOver, StatCard, Badge, Button, Amount, Field, Select, Input } from "../ui";

// One "name … amount" row for the by-card breakdowns.
function CardRow({ name, children }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-b-0 text-sm">
      <span className="text-ink truncate">{name}</span>
      <span className="text-muted whitespace-nowrap">{children}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted mb-1">{title}</div>
      {children}
    </div>
  );
}

// Detail slide-over for one profile: spending summary, per-card breakdowns,
// default money bucket, sharing, and the profile actions.
export default function ProfileDetailPanel({
  profile,
  summary,
  loading,
  buckets,
  shares,
  shareEmail,
  onShareEmailChange,
  onShare,
  onRevoke,
  onSetBucket,
  onMakePrimary,
  onStatement,
  onDelete,
  open,
  onClose,
}) {
  const p = profile;
  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={p ? `${p.name}${p.is_primary ? " (me)" : ""}` : "Profile"}
      subtitle="Spending summary and sharing"
    >
      {p && (
        <div className="space-y-6">
          {loading || !summary ? (
            <p className="text-sm text-muted">Loading summary…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Still unpaid" value={<Amount value={summary.total_unpaid} />} tone="danger" />
                <StatCard
                  label="Cashback earned"
                  value={<Amount value={summary.cashback_earned} />}
                  tone="green"
                />
              </div>

              <Section title="Owed by card">
                {summary.debt_by_card.length === 0 ? (
                  <p className="text-sm text-muted">Nothing owed on any card.</p>
                ) : (
                  summary.debt_by_card.map((c) => (
                    <CardRow key={c.name} name={c.name}>
                      <strong className="text-ink"><Amount value={c.balance} /></strong>
                    </CardRow>
                  ))
                )}
              </Section>

              <Section title="Cashback by card">
                {summary.cashback_by_card.length === 0 ? (
                  <p className="text-sm text-muted">No cashback yet.</p>
                ) : (
                  summary.cashback_by_card.map((c) => (
                    <CardRow key={c.name} name={c.name}>
                      earned <strong className="text-green"><Amount value={c.earned} /></strong>
                      {" · "}pending <Amount value={c.pending} />
                    </CardRow>
                  ))
                )}
              </Section>

              <Section title="Cards used">
                <p className="text-sm text-ink">{summary.cards_used.join(", ") || "—"}</p>
                <p className="text-xs text-muted mt-1">{summary.transactions.length} transaction(s)</p>
              </Section>
            </>
          )}

          <Field label="Default money bucket" className="max-w-xs">
            <Select
              value={p.default_bucket_id || ""}
              onChange={(e) => onSetBucket(e.target.value)}
              title="Where this person's money is kept"
            >
              <option value="">None</option>
              {buckets.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </Field>

          <Section title="Sharing">
            <p className="text-xs text-muted mb-2">
              Share this profile by email. When they sign up with that email, they can
              see (read-only) what they owe.
            </p>
            <form onSubmit={onShare} className="flex items-center gap-2 mb-2">
              <Input
                type="email"
                className="flex-1"
                placeholder="person@email.com"
                value={shareEmail}
                onChange={(e) => onShareEmailChange(e.target.value)}
              />
              <Button type="submit" variant="secondary">Share</Button>
            </form>
            {shares.length === 0 ? (
              <p className="text-sm text-muted">Not shared with anyone yet.</p>
            ) : (
              shares.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                  <span className="text-ink truncate">{s.shared_with_email}</span>
                  <button
                    onClick={() => onRevoke(s.id)}
                    className="text-danger hover:underline shrink-0"
                  >
                    Revoke
                  </button>
                </div>
              ))
            )}
          </Section>

          <div className="flex items-center gap-2 pt-2 border-t border-border">
            {!p.is_primary && (
              <Button variant="primary" onClick={onMakePrimary} title="Mark this profile as you">
                This is me
              </Button>
            )}
            <Button onClick={onStatement} title="Open a printable statement (Save as PDF)">
              Statement
            </Button>
            <Button variant="danger" onClick={onDelete} className="ml-auto">Delete</Button>
          </div>
        </div>
      )}
    </SlideOver>
  );
}
