export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Format an ISO date string ("2026-07-08") as "Jul 8, 2026". Parsed by hand so
// it doesn't shift a day across time zones the way new Date("2026-07-08") can.
export function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return String(iso);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

// Today's date as an ISO string ("2026-07-02") using the browser's LOCAL time.
// new Date().toISOString() converts to UTC first, so late at night it can jump
// to tomorrow's date; building it from the local Y/M/D avoids that shift.
export function todayLocal() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// Format a number as USD with thousands separators, e.g. -$1,234.56
export function money(n) {
  // Round to cents first so floating-point dust (e.g. -1e-13) doesn't render
  // as "-$0.00"; `+ 0` normalizes -0 back to 0 so the sign is dropped.
  const num = Math.round((Number(n) || 0) * 100) / 100 + 0;
  const sign = num < 0 ? "-" : "";
  return `${sign}$${Math.abs(num).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
