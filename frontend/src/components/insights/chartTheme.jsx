// Shared chart chrome. Recharts' defaults are hardcoded light-mode grays, so
// every axis, grid and tooltip has to be told what to use instead.
//
// These pass the RAW css vars (var(--muted), not var(--color-muted)): the
// --color-* names exist for Tailwind's utility generation, while the raw ones
// are real custom properties at runtime. Recharts forwards them as SVG
// presentation attributes, so they re-resolve on their own when dark mode flips
// and the charts need no theme state of their own.
import { money } from "../../format";
import { usePrivacy } from "../../privacy/PrivacyContext";

export const AXIS = {
  tickLine: false,
  axisLine: false,
  tick: { fill: "var(--muted)", fontSize: 12, style: { fontVariantNumeric: "tabular-nums" } },
};

export const GRID = { stroke: "var(--border)", vertical: false };

// Recharts animates every series on mount AND on every data change, which fires
// on each filter click and reads heavy next to the app's 200ms transitions.
export const NO_ANIM = { isAnimationActive: false };

export function ChartTooltip({ title, children }) {
  return (
    <div className="bg-surface border border-border rounded-lg shadow-sm px-3 py-2 text-sm max-w-[16rem]">
      {title && <div className="text-muted text-xs mb-1">{title}</div>}
      {children}
    </div>
  );
}

// Chart text lives in SVG, where <Amount> can't go, so amounts drawn inside a
// chart run through this instead. Same mask, same **** as everywhere else.
export function useMask() {
  const { hidden } = usePrivacy();
  return { hidden, mask: (value) => (hidden ? "****" : money(value)) };
}
