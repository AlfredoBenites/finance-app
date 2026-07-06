// Colors for the bucket "kind" tags. Muted-but-distinct so tags differentiate
// without shouting. Keys are stored in settings (settings.kindColors).
export const TAG_COLORS = [
  ["gray", "Gray", "#6b7280"],
  ["green", "Green", "#16a34a"],
  ["blue", "Blue", "#2563eb"],
  ["orange", "Orange", "#ea580c"],
  ["brown", "Brown", "#8d6e63"],
  ["teal", "Teal", "#0d9488"],
  ["violet", "Violet", "#7c3aed"],
  ["red", "Red", "#dc2626"],
  ["amber", "Amber", "#b45309"],
  ["pink", "Pink", "#db2777"],
];

const HEX = Object.fromEntries(TAG_COLORS.map(([key, , hex]) => [key, hex]));
export const tagHex = (key) => HEX[key] || HEX.gray;

// A pill tag tinted with a chosen color (subtle background + colored text), so
// it reads as a status chip in both light and dark mode.
export function KindBadge({ colorKey, children, title }) {
  const hex = tagHex(colorKey);
  return (
    <span
      title={title}
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: `color-mix(in srgb, ${hex} 16%, transparent)`, color: hex }}
    >
      {children}
    </span>
  );
}
