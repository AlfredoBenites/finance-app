import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, Amount } from "../ui";
import { AXIS, GRID, NO_ANIM, ChartTooltip, useMask } from "./chartTheme";
import { compactMoney, monthLabel } from "./spending";

// Spending per month for the chosen year, and the picker for the two charts
// below it: click a column to scope them to that month, click it again to go
// back to the whole year.
export default function SpendingByMonthChart({ months, average, selectedMonth, onSelectMonth, total }) {
  const { hidden, mask } = useMask();

  const fillFor = (m) => {
    if (!selectedMonth || m.ym === selectedMonth) return "var(--info)";
    // The unselected months stay as context rather than disappearing.
    return "color-mix(in srgb, var(--info) 28%, transparent)";
  };

  function MonthTooltip({ active, payload }) {
    if (!active || !payload?.length) return null;
    const m = payload[0].payload;
    const index = months.findIndex((x) => x.ym === m.ym);
    const prev = index > 0 ? months[index - 1] : null;
    const delta = prev && prev.hasData ? m.total - prev.total : null;
    return (
      <ChartTooltip title={monthLabel(m.ym)}>
        <div className="text-ink font-semibold">
          <Amount value={m.total} />
          {m.isCurrent && <span className="text-muted font-normal text-xs"> so far</span>}
        </div>
        <div className="text-muted text-xs mt-0.5">
          {m.count} {m.count === 1 ? "transaction" : "transactions"}
          {delta !== null && (
            <>
              {" · "}
              {delta >= 0 ? "+" : "-"}
              {mask(Math.abs(delta))} vs {prev.label}
            </>
          )}
        </div>
        {m.refund > 0 && (
          <div className="text-muted text-xs mt-0.5">includes {mask(m.refund)} in refunds</div>
        )}
      </ChartTooltip>
    );
  }

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-base font-semibold text-ink">Spending by month</h2>
        <span className="text-xs text-muted">
          Total <strong className="text-ink"><Amount value={total} /></strong>
        </span>
      </div>
      <div className="h-56">
        <ResponsiveContainer>
          {/* The right margin is the gutter the average line's label sits in. */}
          <BarChart data={months} margin={{ top: 4, right: 30, bottom: 0, left: 0 }} accessibilityLayer>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" {...AXIS} />
            {/* Under Hide amounts the axis would be a stack of identical ****,
                so it goes away entirely and the tooltips carry the numbers. */}
            <YAxis {...AXIS} width={48} tickFormatter={compactMoney} hide={hidden} />
            <ReferenceLine y={0} stroke="var(--border-strong)" />
            {average != null && (
              <ReferenceLine
                y={average}
                stroke="var(--border-strong)"
                strokeDasharray="4 4"
                label={{ value: "avg", position: "right", fill: "var(--muted)", fontSize: 11 }}
              />
            )}
            <Tooltip
              content={<MonthTooltip />}
              cursor={{ fill: "var(--surface-muted)" }}
              wrapperStyle={{ zIndex: 10 }}
            />
            <Bar
              dataKey="total"
              radius={[4, 4, 0, 0]}
              maxBarSize={44}
              {...NO_ANIM}
              onClick={(d) => onSelectMonth(d?.payload?.ym || d?.ym || null)}
            >
              {months.map((m) => (
                <Cell
                  key={m.ym}
                  fill={fillFor(m)}
                  // A half-finished month shouldn't read as a real drop.
                  opacity={m.isCurrent ? 0.7 : 1}
                  cursor="pointer"
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted mt-2">Click a month to see what it went on.</p>
    </Card>
  );
}
