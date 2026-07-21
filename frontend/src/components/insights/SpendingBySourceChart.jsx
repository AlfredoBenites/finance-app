import { Card, Amount } from "../ui";

// What paid for it: one bar split by card or account, with a legend under it.
// Plain divs rather than a chart library — it's a single row, and the 2px gaps
// between segments come free instead of needing strokes that would sit on top
// of the colors.
export default function SpendingBySourceChart({ list, grand, periodLabel }) {
  if (list.length < 2) return null; // a full-width single color says nothing

  return (
    <Card>
      <h2 className="text-base font-semibold text-ink">What paid for it</h2>
      <p className="text-xs text-muted mt-0.5 mb-3">{periodLabel}</p>

      <div className="flex h-3 rounded-full overflow-hidden gap-[2px]">
        {list.map((s) => (
          <div
            key={s.key}
            style={{ width: `${(s.total / grand) * 100}%`, background: s.color }}
            title={s.name}
          />
        ))}
      </div>

      {/* The names and amounts live here, so the colors never have to carry the
          meaning on their own. */}
      <div className="divide-y divide-border mt-3">
        {list.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="flex items-center gap-2 min-w-0">
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ background: s.color }}
              />
              <span className="text-ink truncate">{s.name}</span>
            </span>
            <span className="text-muted whitespace-nowrap">
              <strong className="text-ink"><Amount value={s.total} /></strong>
              {" · "}
              {Math.round((s.total / grand) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
