// Builds a clean, printable "amount owed" statement for a profile and writes it
// into an already-opened window. The window is opened by the caller inside the
// click handler (so pop-up blockers allow it); we fill it after the data loads.
// The page auto-opens the print dialog, so the recipient can Save as PDF.
import { money } from "./format";

// Only the fixed labels are translated. The data (merchant, category, notes) is
// shown exactly as the user entered it — it can't be auto-translated safely.
const STRINGS = {
  en: {
    title: "Amount owed",
    generated: "Generated",
    totalOwed: "Total still owed",
    cashback: "Cashback earned",
    date: "Date",
    merchant: "Merchant",
    category: "Category",
    note: "Note",
    amount: "Amount",
    nothing: "Nothing currently owed. 🎉",
    footer: "Only unpaid charges are listed. Each amount is what is still owed on that card.",
  },
  es: {
    title: "Cantidad adeudada",
    generated: "Generado",
    totalOwed: "Total pendiente",
    cashback: "Cashback ganado",
    date: "Fecha",
    merchant: "Comercio",
    category: "Categoría",
    note: "Nota",
    amount: "Monto",
    nothing: "No se debe nada actualmente. 🎉",
    footer: "Solo se muestran los cargos no pagados. Cada monto es lo que aún se debe en esa tarjeta.",
  },
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

// Tiny, dependency-free date formatter -> "Jul 12, 2026".
// Parses plain "YYYY-MM-DD" without timezone drift; falls back to Date otherwise.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(v) {
  if (!v) return "—";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  if (iso) return `${MONTHS[+iso[2] - 1]} ${+iso[3]}, ${+iso[1]}`;
  const d = new Date(v);
  if (!isNaN(d.getTime())) return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  return String(v);
}

// --- card colors -------------------------------------------------------------
// Each card section is tinted with the color picked for that card on the Credit
// Cards page: a filled header row plus faint alternating body rows, like a bank
// statement. Cards with no color use this neutral gray, which runs through the
// same helpers (so it gets white header text and a light-gray zebra).
const NEUTRAL_COLOR = "#52525b";

// "#abc" / "abcdef" -> "#aabbcc". Returns null for anything we can't read.
function toHex(v) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(v ?? "").trim());
  if (!m) return null;
  const h = m[1].toLowerCase();
  return h.length === 3 ? `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : `#${h}`;
}

function rgbOf(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

// Dark ink on light colors, white on dark ones. Uses WCAG relative luminance;
// 0.18 is where contrast against white and against black cross over.
function readableInk(hex) {
  const [r, g, b] = rgbOf(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.18 ? "#0d0b09" : "#ffffff";
}

// Blend a color toward white. `white` is how much white to mix in, so 0.92
// keeps 8% of the color — enough to read on paper without muddying the text.
function tint(hex, white) {
  const parts = rgbOf(hex).map((v) => Math.round(v + (255 - v) * white));
  return `#${parts.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// The statement's card entries only carry the card NAME, so match the credit
// card rows on name (and on id when a card id is present).
function colorLookup(cards) {
  const byId = {};
  const byName = {};
  for (const c of cards || []) {
    if (!c || !c.color) continue;
    if (c.id) byId[c.id] = c.color;
    if (c.name) byName[String(c.name).trim().toLowerCase()] = c.color;
  }
  return (entry) => {
    const id = entry.credit_card_id || entry.card_id;
    const byName_ = byName[String(entry.card_name ?? "").trim().toLowerCase()];
    return toHex((id && byId[id]) || byName_) || NEUTRAL_COLOR;
  };
}

/**
 * @param win     the already-opened print window
 * @param s       the /statement payload (profile_name, generated_on, total_owed, cards)
 * @param lang    "en" | "es"
 * @param extras  { cards: credit card rows (for per-card color),
 *                  cashback: number shown next to the total }
 */
export function writeStatement(win, s, lang = "en", extras = {}) {
  const t = STRINGS[lang] || STRINGS.en;
  const colorOf = colorLookup(extras.cards);
  // Cashback is optional: the line only prints when the caller passes a number.
  const cashbackNum = Number(extras.cashback);
  const cashback = extras.cashback == null || !Number.isFinite(cashbackNum) ? null : cashbackNum;

  // One small style block per card so each table carries its own colors.
  const cardStyles = [];
  const cardSections = s.cards
    .map((c, i) => {
      const color = colorOf(c);
      const cls = `card${i}`;
      cardStyles.push(`
  .${cls} tr.cardhead th { background: ${color}; color: ${readableInk(color)}; }
  .${cls} tr.colhead th { background: ${tint(color, 0.84)}; color: #3f3f46; border-bottom-color: ${tint(color, 0.66)}; }
  .${cls} tbody tr:nth-child(even) td { background: ${tint(color, 0.92)}; }`);

      const rows = c.transactions
        .map(
          (tx) => `
        <tr>
          <td class="date">${esc(fmtDate(tx.transaction_date))}</td>
          <td>${esc(tx.merchant || "—")}</td>
          <td class="cat">${esc(tx.category || "—")}</td>
          <td class="note">${esc(tx.notes || "")}</td>
          <td class="amt">${money(-tx.amount)}</td>
        </tr>`
        )
        .join("");
      return `
      <section class="${cls}">
        <table>
          <thead>
            <tr class="cardhead">
              <th colspan="4"><span class="cardname">${esc(c.card_name)}</span></th>
              <th class="amt cardowed">${money(c.owed)}</th>
            </tr>
            <tr class="colhead">
              <th class="date">${t.date}</th>
              <th>${t.merchant}</th>
              <th class="cat">${t.category}</th>
              <th class="note">${t.note}</th>
              <th class="amt">${t.amount}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><title>${t.title} — ${esc(s.profile_name)}</title>
<style>
  @page { margin: 16mm; }
  * { box-sizing: border-box; }
  html, body { background: #ffffff; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #0d0b09;
    max-width: 720px;
    margin: 28px auto;
    padding: 0 24px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  header { padding-bottom: 14px; border-bottom: 3px solid #e4f222; }
  h1 { margin: 0 0 4px; font-size: 23px; font-weight: 700; letter-spacing: -0.01em; color: #0d0b09; }
  h1 .who { color: #6b7280; font-weight: 500; }
  .meta { color: #6b7280; font-size: 12.5px; margin: 0; }

  /* Summary: labels on the left, figures on the right. The total gets the brand
     accent; cashback sits under it on its own line. */
  .summary {
    margin: 22px 0 8px;
    border: 1px solid #ececec;
    border-radius: 10px;
    background: #fafafa;
  }
  .summary .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding: 16px 18px;
  }
  .summary .row + .row { border-top: 1px solid #ececec; padding: 11px 18px; }
  .summary .label { color: #6b7280; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  .summary .figure {
    font-size: 24px;
    font-weight: 800;
    color: #0d0b09;
    padding: 2px 10px;
    border-radius: 4px;
    background: #e4f222;
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum";
  }
  .summary .value {
    font-size: 16px;
    font-weight: 700;
    color: #26753b;
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum";
  }

  section { margin: 26px 0 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }

  /* Card title row: keep it glued to the column headers and first data rows so a
     card never leaves its heading stranded at the bottom of a page. */
  thead { display: table-header-group; }
  tr.cardhead th {
    padding: 9px 10px;
    background: ${NEUTRAL_COLOR};
    color: #ffffff;
    /* Keeps a hairline under the bar even when a card's color is very pale. */
    border-bottom: 1px solid rgba(0, 0, 0, 0.10);
    text-align: left;
    vertical-align: baseline;
  }
  .cardname { font-size: 15px; font-weight: 700; }
  .cardowed { font-size: 14px; font-weight: 700; white-space: nowrap; }

  tr.colhead th {
    padding: 8px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #3f3f46;
    background: #f4f4f5;
    border-bottom: 1px solid #ececec;
  }
  tbody td { padding: 7px 8px; border-bottom: 1px solid #ececec; vertical-align: top; }
  tbody tr:last-child td { border-bottom: none; }
  tr { break-inside: avoid; }

  .date { white-space: nowrap; color: #0d0b09; }
  .cat { color: #6b7280; }
  .note { color: #6b7280; }
  .amt {
    text-align: right;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum";
  }
  tbody .amt { font-weight: 600; color: #0d0b09; }

  /* Per-card colors (header fill + zebra tint), one rule set per card. */${cardStyles.join("")}

  .empty { margin: 28px 0; color: #6b7280; font-size: 14px; }
  footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #ececec; color: #9ca3af; font-size: 11.5px; }

  @media print { body { margin: 0 auto; max-width: none; padding: 0; } }
</style></head>
<body onload="window.print()">
  <header>
    <h1>${t.title} <span class="who">— ${esc(s.profile_name)}</span></h1>
    <p class="meta">${t.generated} ${esc(fmtDate(s.generated_on))}</p>
  </header>
  <div class="summary">
    <div class="row">
      <span class="label">${t.totalOwed}</span>
      <span class="figure">${money(s.total_owed)}</span>
    </div>
    ${cashback === null ? "" : `<div class="row">
      <span class="label">${t.cashback}</span>
      <span class="value">${money(cashback)}</span>
    </div>`}
  </div>
  ${s.cards.length ? cardSections : `<p class="empty">${t.nothing}</p>`}
  <footer>${t.footer}</footer>
</body></html>`;

  win.document.write(html);
  win.document.close();
}
