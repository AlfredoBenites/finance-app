import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, Amount } from "../ui";
import useMediaQuery from "../../hooks/useMediaQuery";
import { AXIS, CLICKABLE_CHART, NO_ANIM, TOOLTIP, ChartTooltip, useMask } from "./chartTheme";

// Where the money went, ranked. Every bar is the same color on purpose: the
// categories have no order of their own, and bar length already says which is
// biggest, so spending a second color channel on it would say nothing new.
// With a month picked, a row opens the transactions behind it.
export default function SpendingByCategoryChart({
  rows,
  grand,
  netZeroOrLess,
  periodLabel,
  onSelectRow,
}) {
  const { mask } = useMask();
  const narrow = useMediaQuery("(max-width: 640px)");
  // The label column is a fixed pixel width, so on a phone it has to give back
  // the room the bars need.
  const labelWidth = narrow ? 84 : 124;
  const maxLabel = narrow ? 11 : 18;
  const truncate = (s) => (s.length > maxLabel ? `${s.slice(0, maxLabel - 1)}…` : s);

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
        <div
          className={onSelectRow ? CLICKABLE_CHART : undefined}
          style={{ height: `${rows.length * 2.25 + 0.5}rem` }}
        >
          <ResponsiveContainer>
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
              accessibilityLayer
            >
              {/* Headroom past the longest bar is where its amount label goes.
                  A phone needs proportionally more of it, since the label is a
                  fixed number of pixels in a much narrower chart. */}
              <XAxis type="number" hide domain={[0, (max) => max * (narrow ? 1.5 : 1.25)]} />
              {/* tick comes AFTER the spread: AXIS carries a default `tick` and
                  would otherwise overwrite the custom one. */}
              <YAxis type="category" dataKey="name" width={labelWidth} {...AXIS} tick={<CategoryTick />} />
              <Tooltip content={<CategoryTooltip />} {...TOOLTIP} />
              {/* The invisible `background` rectangle makes the whole row the
                  tap target rather than a 14px-tall bar. See the same note in
                  SpendingByMonthChart for why it can't be a hover-based handler. */}
              <Bar
                dataKey="total"
                fill="var(--info)"
                radius={[0, 4, 4, 0]}
                barSize={14}
                background={onSelectRow ? { fill: "transparent" } : false}
                onClick={(entry) => {
                  const row = entry?.payload ?? entry;
                  if (onSelectRow && row?.name) onSelectRow(row);
                }}
                {...NO_ANIM}
              >
                {rows.map((r) => (
                  <Cell key={r.name} cursor={onSelectRow ? "pointer" : "default"} />
                ))}
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

      {rows.length > 0 && (
        <p className="text-xs text-muted mt-2">
          {onSelectRow
            ? "Tap a category to see the transactions behind it."
            : "Pick a month above to see the transactions behind a category."}
        </p>
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
