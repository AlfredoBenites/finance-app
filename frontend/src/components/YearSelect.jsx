// Year filter used on Dashboard, Expenses, and Income.
// value is a year string (e.g. "2026") or "all". Defaults to the current year.
const NOW = new Date().getFullYear();
export const CURRENT_YEAR = String(NOW);
export const YEARS = [NOW, NOW - 1, NOW - 2];

export default function YearSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {YEARS.map((y) => (
        <option key={y} value={String(y)}>{y}</option>
      ))}
      <option value="all">All time</option>
    </select>
  );
}
