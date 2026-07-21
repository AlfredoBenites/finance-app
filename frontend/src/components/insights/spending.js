// Pure transforms behind the Insights spending charts. No React, no fetching:
// give them a year's transactions and they hand back chart-ready rows.
import { MONTHS, todayLocal } from "../../format";

// Colors for payment sources. Deliberately NOT the colors picked on the Credit
// Cards page: those are dark card-art tones that all but disappear against the
// dark canvas. These are checked for colorblind separation and for contrast
// against both the light and the dark surface. Fixed order, assigned by source
// id rather than by rank, so changing the month never repaints anything.
export const SOURCE_COLORS = ["#3b82f6", "#ef4444", "#0d9488", "#8b5cf6", "#ec4899", "#16a34a"];
const UNKNOWN_COLOR = "var(--muted)";

// Amounts arrive as strings ("-52.40") with purchases NEGATIVE and refunds
// POSITIVE. Flip the sign so spending counts up, and hold cents as integers so
// a year of adding two-decimal floats can't drift a comparison off zero.
export function normalize(rows) {
  return rows.map((t) => {
    const iso = String(t.transaction_date); // never new Date(iso): it shifts a day
    return {
      id: t.id,
      ym: iso.slice(0, 7), // "2026-07"
      monthIndex: Number(iso.slice(5, 7)) - 1,
      category: (t.category || "").trim() || "Uncategorized",
      cents: Math.round(-Number(t.amount) * 100), // > 0 spent, < 0 refunded
      sourceKey: t.credit_card_id ? `card:${t.credit_card_id}` : `account:${t.account_id}`,
    };
  });
}

// Totals per month, oldest first. Months that haven't happened yet are dropped
// rather than drawn as zero (in July, an empty August reads as "spent nothing"),
// but past months with no spending stay so the axis keeps honest spacing.
export function byMonth(txns, year) {
  const acc = Array.from({ length: 12 }, () => ({ net: 0, refund: 0, count: 0, seen: false }));
  for (const t of txns) {
    const a = acc[t.monthIndex];
    if (!a) continue;
    a.net += t.cents;
    a.count += 1;
    a.seen = true;
    if (t.cents < 0) a.refund += -t.cents;
  }
  const today = todayLocal();
  const isThisYear = year === today.slice(0, 4);
  const lastIndex = isThisYear ? Number(today.slice(5, 7)) - 1 : 11;
  return acc.slice(0, lastIndex + 1).map((a, i) => ({
    ym: `${year}-${String(i + 1).padStart(2, "0")}`,
    label: MONTHS[i],
    total: a.net / 100,
    refund: a.refund / 100,
    count: a.count,
    hasData: a.seen,
    isCurrent: isThisYear && i === lastIndex,
  }));
}

// The dashed "typical month" line. The current month is still filling up and
// empty months aren't really months, so neither should drag the average down.
export function monthlyAverage(months) {
  const done = months.filter((m) => m.hasData && !m.isCurrent);
  if (done.length < 2) return null;
  return done.reduce((sum, m) => sum + m.total, 0) / done.length;
}

// Categories ranked by spend, biggest first. Categories come from the
// transactions themselves, not the categories table: deleting a category never
// rewrites old rows, so its spending has to keep showing up somewhere.
export function byCategory(txns, ym, topN = 8) {
  const map = new Map();
  for (const t of txns) {
    if (ym && t.ym !== ym) continue;
    const entry = map.get(t.category) || { cents: 0, count: 0 };
    entry.cents += t.cents;
    entry.count += 1;
    map.set(t.category, entry);
  }
  const all = [...map].map(([name, e]) => ({ name, total: e.cents / 100, count: e.count }));
  const spent = all.filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
  // A category that nets to zero or below (refunded more than spent) has no bar
  // to draw, so it's reported as a footnote instead of vanishing silently.
  const netZeroOrLess = all.filter((r) => r.total <= 0);

  const head = spent.slice(0, topN);
  const tail = spent.slice(topN);
  const rows = tail.length
    ? [
        ...head,
        {
          // Not "Other": that's a real category people pick, and two rows with
          // the same name showing different numbers would be indefensible.
          name: "All other categories",
          total: tail.reduce((sum, r) => sum + r.total, 0),
          count: tail.reduce((sum, r) => sum + r.count, 0),
          rolledUp: tail,
        },
      ]
    : head;

  return { rows, grand: spent.reduce((sum, r) => sum + r.total, 0), netZeroOrLess };
}

// Spending split by what paid for it: which card, or which account.
export function bySource(txns, ym, cards, accounts, maxSlices = 6) {
  const map = new Map();
  for (const t of txns) {
    if (ym && t.ym !== ym) continue;
    map.set(t.sourceKey, (map.get(t.sourceKey) || 0) + t.cents);
  }

  // Every card and account gets its color from this one fixed list, so a source
  // keeps the same color no matter which month is on screen.
  const order = [
    ...cards.map((c) => `card:${c.id}`),
    ...accounts.map((a) => `account:${a.id}`),
  ].sort();
  const colorFor = (key) => {
    const i = order.indexOf(key);
    return i < 0 ? UNKNOWN_COLOR : SOURCE_COLORS[i % SOURCE_COLORS.length];
  };

  let list = [...map]
    .map(([key, cents]) => {
      const [kind, id] = key.split(":");
      const source =
        kind === "card" ? cards.find((c) => c.id === id) : accounts.find((a) => a.id === id);
      return {
        key,
        kind,
        // A source can be deleted while its transactions live on; never draw a
        // slice with a blank name.
        name: source?.name ?? (kind === "card" ? "Deleted card" : "Deleted account"),
        total: cents / 100,
        color: colorFor(key),
      };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  if (list.length > maxSlices) {
    const tail = list.slice(maxSlices - 1);
    list = [
      ...list.slice(0, maxSlices - 1),
      {
        key: "other",
        kind: "other",
        name: "All other sources",
        total: tail.reduce((sum, r) => sum + r.total, 0),
        color: UNKNOWN_COLOR,
      },
    ];
  }

  return { list, grand: list.reduce((sum, r) => sum + r.total, 0) };
}

// Short axis money, e.g. $1.2k / $12k. Full amounts live in the tooltips.
export function compactMoney(n) {
  const abs = Math.abs(n);
  if (abs >= 1000) return `$${(n / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return `$${Math.round(n)}`;
}

// "2026-07" -> "July 2026"
const FULL_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export function monthLabel(ym) {
  if (!ym) return "";
  const [year, month] = String(ym).split("-");
  return `${FULL_MONTHS[Number(month) - 1]} ${year}`;
}
