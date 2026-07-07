import { cn } from "./cn";
import { usePrivacy } from "../../privacy/PrivacyContext";

// Money input that formats as you type, calculator-style: the digits you enter
// fill in from the cents up, so typing "1234" reads as 12.34, and larger amounts
// get thousands commas (e.g. "123456" → "1,234.56"). No need to type the decimal.
// value/onChange use a plain decimal string (e.g. "12.34") so the form can call
// Number(value) directly.
function format(decimalStr) {
  if (decimalStr === "" || decimalStr == null) return "";
  const n = Number(decimalStr);
  if (Number.isNaN(n)) return "";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AmountInput({ value, onChange, className, placeholder = "0.00", ...props }) {
  // When "Hide amounts" is on, mask the typed value like a password field (you can
  // still edit it) so amounts stay private in input boxes too, not just displays.
  const { hidden } = usePrivacy();

  function handleChange(e) {
    const digits = e.target.value.replace(/\D/g, "");
    if (!digits) {
      onChange("");
      return;
    }
    // Treat all entered digits as cents, then convert to dollars.
    const cents = parseInt(digits, 10);
    onChange((cents / 100).toFixed(2));
  }

  return (
    <div className={cn("relative", className)}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm pointer-events-none">$</span>
      <input
        inputMode="numeric"
        value={format(value)}
        onChange={handleChange}
        placeholder={placeholder}
        className="bg-surface text-ink border border-border rounded-md pl-6 pr-3 py-2 text-sm w-full tnum placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
        {...props}
        {...(hidden ? { type: "password" } : {})}
      />
    </div>
  );
}
