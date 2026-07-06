import { useState } from "react";
import { Input, Button } from "../ui";
import { money, formatDate } from "../../format";

// Search dropdown for choosing the purchase a refund offsets. `candidates` are
// the same card's purchases (passed in already scoped). Value is a transaction id.
export default function RefundPicker({ value, candidates, onChange }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const label = (t) => `${t.merchant || "—"} · ${formatDate(t.transaction_date)} · ${money(t.amount)}`;
  const selected = candidates.find((c) => c.id === value);

  if (selected) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex-1 min-w-0 truncate text-sm text-ink rounded-md border border-border bg-surface-muted px-3 py-2">
          {label(selected)}
        </span>
        <Button size="sm" variant="ghost" onClick={() => onChange(null)}>Change</Button>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = candidates
    .filter((t) => !q || `${t.merchant || ""} ${money(t.amount)} ${t.transaction_date}`.toLowerCase().includes(q))
    .slice(0, 8);

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder={candidates.length ? "Search a purchase on this card…" : "Pick a card first"}
        disabled={candidates.length === 0}
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-md border border-border bg-surface shadow-sm">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted">No matching purchases on this card.</div>
          ) : (
            filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { onChange(t.id); setOpen(false); setQuery(""); }}
                className="block w-full text-left px-3 py-2 text-sm text-ink hover:bg-surface-muted"
              >
                {label(t)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
