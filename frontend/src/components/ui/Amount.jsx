import { money } from "../../format";
import { usePrivacy } from "../../privacy/PrivacyContext";
import { cn } from "./cn";

// Renders a money value with tabular figures. When privacy mode is on it masks
// the value as ****. Use this instead of calling money() directly so any amount
// can be hidden globally. `tone` colors the value like StatCard.
const TONES = {
  default: "",
  green: "text-green",
  danger: "text-danger",
  muted: "text-muted",
};

export default function Amount({ value, tone = "default", className }) {
  const { hidden } = usePrivacy();
  return (
    <span className={cn("tnum", TONES[tone], className)}>
      {hidden ? "****" : money(value)}
    </span>
  );
}
