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
