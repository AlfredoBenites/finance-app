// Builds a clean, printable "amount owed" statement for a profile and writes it
// into an already-opened window. The window is opened by the caller inside the
// click handler (so pop-up blockers allow it); we fill it after the data loads.
// The page auto-opens the print dialog, so the recipient can Save as PDF.
import { money } from "./format";

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

export function writeStatement(win, s) {
  const cardSections = s.cards
    .map((c) => {
      const rows = c.transactions
        .map(
          (t) => `
        <tr>
          <td>${esc(t.transaction_date)}</td>
          <td>${esc(t.merchant || "—")}</td>
          <td>${esc(t.category || "—")}</td>
          <td class="note">${esc(t.notes || "")}</td>
          <td class="amt">${money(-t.amount)}</td>
        </tr>`
        )
        .join("");
      return `
      <section>
        <div class="cardhead"><h2>${esc(c.card_name)}</h2><div class="cardowed">${money(c.owed)}</div></div>
        <table>
          <thead><tr><th>Date</th><th>Merchant</th><th>Category</th><th>Note</th><th class="amt">Amount</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
    })
    .join("");

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Amount owed — ${esc(s.profile_name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; color: #1a1a1a; max-width: 760px; margin: 32px auto; padding: 0 24px; }
  header { border-bottom: 3px solid #2563eb; padding-bottom: 12px; }
  h1 { margin: 0 0 4px; font-size: 24px; }
  .meta { color: #6b7280; font-size: 13px; margin: 0; }
  .total { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px 18px; margin: 20px 0; display: flex; justify-content: space-between; align-items: center; font-size: 18px; }
  .total strong { font-size: 22px; color: #1d4ed8; }
  section { margin: 22px 0; page-break-inside: avoid; }
  .cardhead { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #e3e3e3; padding-bottom: 4px; }
  h2 { font-size: 17px; margin: 0; }
  .cardowed { font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #f0f0f0; }
  th { color: #6b7280; font-weight: 600; border-bottom: 1px solid #e3e3e3; }
  .amt { text-align: right; white-space: nowrap; }
  .note { color: #6b7280; }
  footer { margin-top: 28px; color: #9ca3af; font-size: 12px; border-top: 1px solid #e3e3e3; padding-top: 10px; }
  @media print { body { margin: 0 auto; } }
</style></head>
<body onload="window.print()">
  <header>
    <h1>Amount owed — ${esc(s.profile_name)}</h1>
    <p class="meta">Generated ${esc(s.generated_on)}</p>
  </header>
  <div class="total"><span>Total still owed</span><strong>${money(s.total_owed)}</strong></div>
  ${s.cards.length ? cardSections : "<p>Nothing currently owed. 🎉</p>"}
  <footer>Only unpaid charges are listed. Each amount is what is still owed on that card.</footer>
</body></html>`;

  win.document.write(html);
  win.document.close();
}
