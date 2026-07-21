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

export function writeStatement(win, s, lang = "en") {
  const t = STRINGS[lang] || STRINGS.en;
  const cardSections = s.cards
    .map((c) => {
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
      <section>
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

  /* Summary: label on the left, total figure highlighted with the brand accent. */
  .total {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    margin: 22px 0 8px;
    padding: 16px 18px;
    border: 1px solid #ececec;
    border-radius: 10px;
    background: #fafafa;
  }
  .total .label { color: #6b7280; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  .total .figure {
    font-size: 24px;
    font-weight: 800;
    color: #0d0b09;
    padding: 2px 10px;
    border-radius: 4px;
    background: #e4f222;
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum";
  }

  section { margin: 26px 0 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }

  /* Card title row: keep it glued to the column headers and first data rows so a
     card never leaves its heading stranded at the bottom of a page. */
  thead { display: table-header-group; }
  tr.cardhead th {
    padding: 0 0 6px;
    border-bottom: 2px solid #0d0b09;
    text-align: left;
    vertical-align: baseline;
  }
  .cardname { font-size: 16px; font-weight: 700; color: #0d0b09; }
  .cardowed { font-size: 14px; font-weight: 700; color: #26753b; white-space: nowrap; }

  tr.colhead th {
    padding: 8px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #6b7280;
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

  .empty { margin: 28px 0; color: #6b7280; font-size: 14px; }
  footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #ececec; color: #9ca3af; font-size: 11.5px; }

  @media print { body { margin: 0 auto; max-width: none; padding: 0; } }
</style></head>
<body onload="window.print()">
  <header>
    <h1>${t.title} <span class="who">— ${esc(s.profile_name)}</span></h1>
    <p class="meta">${t.generated} ${esc(s.generated_on)}</p>
  </header>
  <div class="total">
    <span class="label">${t.totalOwed}</span>
    <span class="figure">${money(s.total_owed)}</span>
  </div>
  ${s.cards.length ? cardSections : `<p class="empty">${t.nothing}</p>`}
  <footer>${t.footer}</footer>
</body></html>`;

  win.document.write(html);
  win.document.close();
}
