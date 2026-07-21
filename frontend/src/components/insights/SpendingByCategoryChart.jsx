import {
  Bar,
  BarChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, Amount } from "../ui";
import { AXIS, NO_ANIM, ChartTooltip, useMask } from "./chartTheme";

// Where the money went, ranked. Every bar is the same color on purpose: the
// categories have no order of their own, and bar length already says which is
// biggest, so spending a second color channel on it would say nothing new.
const MAX_LABEL = 18;
const truncate = (s) => (s.length > MAX_LABEL ? `${s.slice(0, MAX_LABEL - 1)}…` : s);

// Recharts' own tick wraps a long name onto a second line, which then gets
// clipped by the row height. Draw the tick so a name can only ever be one line.
function CategoryTick({ x, y, payload }) {
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fill="var(--muted)" fontSize={12}>
      <title>{payload.value}</title>
      {truncate(payload.value)}
    </text>
  );
}

export default function SpendingByCategoryChart({ rows, grand, netZeroOrLess, periodLabel }) {
  const { mask } = useMask();

  function CategoryTooltip({ active, payload }) {
    if (!active || !payload?.length) return null;
    const r = payload[0].payload;
    const share = grand > 0 ? Math.round((r.total / grand) * 100) : 0;
    return (
      <ChartTooltip title={r.name}>
        <div className="text-ink font-semibold"><Amount value={r.total} /></div>
        <div className="text-muted text-xs mt-0.5">
          {share}% of spending · {r.count} {r.count === 1 ? "transaction" : "transactions"}
        </div>
        {r.rolledUp && (
          <div className="text-muted text-xs mt-1">
            {r.rolledUp.slice(0, 5).map((x) => x.name).join(", ")}
            {r.rolledUp.length > 5 ? `, and ${r.rolledUp.length - 5} more` : ""}
          </div>
        )}
      </ChartTooltip>
    );
  }

  return (
    <Card>
      <h2 className="text-base font-semibold text-ink">Where it went</h2>
      <p className="text-xs text-muted mt-0.5 mb-3">{periodLabel}</p>

      {rows.length === 0 ? (
        <p className="text-muted text-sm py-6">Nothing spent in this period.</p>
      ) : (
        // Grow with the rows instead of scaling to a fixed box, so the labels
        // keep the same size whether there are three categories or nine.
        <div style={{ height: `${rows.length * 2.25 + 0.5}rem` }}>
          <ResponsiveContainer>
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
              accessibilityLayer
            >
              {/* Leaves room on the right for each bar's own amount label. */}
              <XAxis type="number" hide domain={[0, (max) => max * 1.25]} />
              <YAxis type="category" dataKey="name" width={124} tick={<CategoryTick />} {...AXIS} />
              <Tooltip
                content={<CategoryTooltip />}
                cursor={{ fill: "var(--surface-muted)" }}
                wrapperStyle={{ zIndex: 10 }}
              />
              <Bar dataKey="total" fill="var(--info)" radius={[0, 4, 4, 0]} barSize={14} {...NO_ANIM}>
                <LabelList
                  dataKey="total"
                  position="right"
                  formatter={mask}
                  style={{ fill: "var(--ink)", fontSize: 12, fontVariantNumeric: "tabular-nums" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {netZeroOrLess.length > 0 && (
        <p className="text-xs text-muted mt-2">
          {netZeroOrLess.length}{" "}
          {netZeroOrLess.length === 1 ? "category" : "categories"} came out to $0 or less after
          refunds, so {netZeroOrLess.length === 1 ? "it isn't" : "they aren't"} shown:{" "}
          {netZeroOrLess.map((r) => r.name).join(", ")}.
        </p>
      )}
    </Card>
  );
}
